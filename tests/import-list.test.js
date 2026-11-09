const test = require("node:test");
const assert = require("node:assert/strict");
const lists = require("../import-list.js");

const valid = { format: "link-guard-hosts", version: 1, name: "News",
  category: "news", hosts: ["www.example.org", "example.org"] };

test("strict import accepts only exact DNS hosts and known schema", () => {
  assert.deepEqual(lists.parse(JSON.stringify(valid)).hosts, ["example.org", "www.example.org"]);
  for (const bad of [
    { ...valid, hosts: ["https://example.org/reset?token=x"] },
    { ...valid, hosts: ["*.example.org"] },
    { ...valid, hosts: ["127.0.0.1"] },
    { ...valid, hosts: ["example.org", "EXAMPLE.ORG"] },
    { ...valid, unexpected: true },
    { ...valid, category: "javascript" }
  ]) assert.throws(() => lists.parse(JSON.stringify(bad)));
  assert.throws(() => lists.parse("x".repeat(lists.MAX_BYTES + 1)), /importTooLarge/);
});

test("a list may hold 5,000 hosts within 512 KiB, and no more", () => {
  assert.equal(lists.MAX_HOSTS, 5000);
  assert.equal(lists.MAX_BYTES, 512 * 1024);
  const hosts = Array.from({ length: 5001 }, (_, i) => `www.host-number-${i}.example.org`);
  assert.equal(lists.parse(JSON.stringify({ ...valid, hosts: hosts.slice(0, 5000) })).hosts.length, 5000);
  assert.throws(() => lists.parse(JSON.stringify({ ...valid, hosts })), /importFormat/);
  // Stored lists are re-validated with the same limits.
  const stored = lists.cleanStored([{ id: "12345678-1234-1234-1234-123456789abc",
    ...valid, hosts: hosts.slice(0, 5000), enabled: true }]);
  assert.equal(stored[0].hosts.length, 5000);
});

test("remote URL disallows HTTP, credentials, ports, fragments and query data", () => {
  assert.equal(lists.parseRemoteUrl("https://lists.example.org/list.json"),
    "https://lists.example.org/list.json");
  for (const url of ["http://example.org/a.json", "https://u:p@example.org/a.json",
    "https://example.org:8443/a.json", "https://example.org/a.json?token=x",
    "https://example.org/a.json#x", "https://127.0.0.1/a.json"]) {
    assert.throws(() => lists.parseRemoteUrl(url), /importUrl/);
  }
});

test("remote content is bounded and fetched without credentials or redirects", async () => {
  const data = new TextEncoder().encode(JSON.stringify(valid));
  let options;
  const response = { ok: true, url: "https://lists.example.org/list.json",
    headers: { get(name) { return name === "content-type" ? "application/json" : null; } },
    body: { getReader() { let read = false; return { async read() {
      if (read) return { done: true }; read = true; return { done: false, value: data };
    } }; } } };
  const result = await lists.fetchRemote(response.url, async (_, input) => {
    options = input; return response;
  });
  assert.equal(options.credentials, "omit");
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  assert.deepEqual(result.hosts, ["example.org", "www.example.org"]);
  await assert.rejects(lists.fetchRemote(response.url, async () =>
    ({ ...response, url: "https://other.example.org/list.json" })), /importFetch/);
});

test("corrupt stored imports are ignored rather than approved", () => {
  const good = { id: "12345678-1234-1234-1234-123456789abc",
    name: "News", category: "news", hosts: ["example.org"], enabled: true };
  assert.equal(lists.cleanStored([good, { ...good, id: "bad", hosts: ["*.example.org"] }]).length, 1);
});

test("lists default to allow and accept an explicit kind", () => {
  assert.equal(lists.parse(JSON.stringify(valid)).kind, "allow");
  assert.equal(lists.parse(JSON.stringify({ ...valid, kind: "allow" })).kind, "allow");
  assert.equal(lists.parse(JSON.stringify({ ...valid, kind: "block" })).kind, "block");
  for (const kind of ["trust", "", null, 1]) {
    assert.throws(() => lists.parse(JSON.stringify({ ...valid, kind })), /importFormat/);
  }
});

test("only block lists may contain whole-domain wildcards", () => {
  const block = { ...valid, kind: "block", hosts: ["*.Example.org", "login.example.net"] };
  assert.deepEqual(lists.parse(JSON.stringify(block)).hosts, ["*.example.org", "login.example.net"]);
  assert.throws(() => lists.parse(JSON.stringify({ ...block, kind: "allow" })), /importFormat/);
  for (const bad of ["*.", "*.*.example.org", "**.example.org", "*example.org", "*.127.0.0.1"]) {
    assert.throws(() => lists.parse(JSON.stringify({ ...block, hosts: [bad] })), /importFormat/, bad);
  }
  assert.throws(() => lists.parse(JSON.stringify({ ...block,
    hosts: ["*.example.org", "*.EXAMPLE.org"] })), /importDuplicate/);
});

test("stored block lists keep their kind and corrupt kinds are dropped", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const stored = { id, name: "Bad", category: "other", kind: "block",
    hosts: ["*.example.org"], enabled: true };
  assert.deepEqual(lists.cleanStored([stored]).map(list => [list.kind, list.hosts]),
    [["block", ["*.example.org"]]]);
  assert.equal(lists.cleanStored([{ ...stored, kind: undefined, hosts: ["example.org"] }])[0].kind, "allow");
  assert.equal(lists.cleanStored([{ ...stored, kind: "weird" }]).length, 0);
  assert.equal(lists.cleanStored([{ ...stored, kind: undefined }]).length, 0);
});

test("only enabled remote blocklists that opted in are due for automatic refresh", () => {
  const base = { kind: "block", enabled: true, autoRefresh: true, sourceUrl: "https://lists.example.org/a.json",
    refreshedAt: 1000, refreshStatus: "ok" };
  const day = 24 * 60 * 60 * 1000;
  assert.equal(lists.autoRefreshDue(base, 1000 + day - 1), false);
  assert.equal(lists.autoRefreshDue(base, 1000 + day), true);
  assert.equal(lists.autoRefreshDue({ ...base, refreshStatus: "failed" }, 1000 + 60 * 60 * 1000), true);
  assert.equal(lists.autoRefreshDue({ ...base, refreshStatus: "failed" }, 1000 + 1000), false);
  for (const change of [{ enabled: false }, { autoRefresh: false }, { kind: "allow" }, { sourceUrl: "" }]) {
    assert.equal(lists.autoRefreshDue({ ...base, ...change }, 1000 + 10 * day), false);
  }
});

test("stored auto-refresh is honoured only for remote blocklists", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const item = { id, name: "L", category: "other", kind: "block", hosts: ["example.org"],
    sourceUrl: "https://lists.example.org/a.json", enabled: true, autoRefresh: true,
    refreshedAt: 5, refreshStatus: "failed" };
  assert.deepEqual(
    (({ autoRefresh, refreshedAt, refreshStatus }) => ({ autoRefresh, refreshedAt, refreshStatus }))(
      lists.cleanStored([item])[0]), { autoRefresh: true, refreshedAt: 5, refreshStatus: "failed" });
  for (const change of [{ kind: "allow" }, { sourceUrl: "" }]) {
    assert.equal(lists.cleanStored([{ ...item, ...change }])[0].autoRefresh, false);
  }
  // On by default for remote blocklists; only an explicit false switches it off.
  const { autoRefresh: _omitted, ...unset } = item;
  assert.equal(lists.cleanStored([unset])[0].autoRefresh, true);
  assert.equal(lists.cleanStored([{ ...item, autoRefresh: false }])[0].autoRefresh, false);
  assert.equal(lists.cleanStored([{ ...unset, kind: "allow", hosts: ["example.org"] }])[0].autoRefresh, false);
  const odd = lists.cleanStored([{ ...item, refreshedAt: "now", refreshStatus: "weird" }])[0];
  assert.equal(odd.refreshedAt, 0);
  assert.equal(odd.refreshStatus, "");
});

test("automatic updates are assessed against size and the user's approvals", () => {
  const entries = (n, prefix = "h") => Array.from({ length: n }, (_, i) => `${prefix}${i}.example.org`);
  const old = entries(12);
  const assess = (next, hosts = [], domains = []) => lists.assessAutoUpdate(old, next, hosts, domains);
  assert.equal(assess([...old, "extra.example.org"]), "ok");
  assert.equal(assess([...old, ...entries(51, "n")]), "review");
  assert.equal(assess(entries(5)), "review");
  assert.equal(assess([...old, "*.shop.org"], ["www.shop.org"]), "review");
  assert.equal(assess([...old, "*.shop.org"], [], ["shop.org"]), "review");
  assert.equal(assess([...old, "www.shop.org"], [], ["shop.org"]), "review");
  assert.equal(assess([...old, "*.sub.shop.org"], [], ["shop.org"]), "review");
  assert.equal(assess([...old, "www.shop.org"], ["shop.org"], []), "ok");
  assert.equal(assess([...old, "*.shop.org"], ["other.org"], ["other.net"]), "ok");
  // Entries that were already in the list are not judged again.
  assert.equal(assess([...old], ["h1.example.org"], ["example.org"]), "ok");
});
