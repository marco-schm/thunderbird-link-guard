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
  assert.throws(() => lists.parse("x".repeat(65537)), /importTooLarge/);
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
