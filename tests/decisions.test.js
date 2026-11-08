const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const policy = require("../policy.js");
const listImport = require("../import-list.js");
const domainScope = require("../domain-scope.js");
const safeRegex = require("../safe-regex.js");
const warnings = require("../warning-rules.js");

// Exact membership in a list of hosts (not a substring test on a URL).
const has = (list, value) => [...list].some(item => item === value);

function harness() {
  const local = { trustedHosts: ["old.example.com"] };
  const remote = { calls: [], handler: null };
  let onMessage;
  const storageArea = values => ({
    async get(defaults) { return { ...defaults, ...values }; },
    async set(changes) { Object.assign(values, changes); }
  });
  const messenger = {
    storage: { local: storageArea(local) },
    scripting: { messageDisplay: {
      async getRegisteredScripts() { return []; },
      async unregisterScripts() {},
      async registerScripts() {}
    } },
    action: { onClicked: { addListener() {} } },
    messageDisplay: { onMessagesDisplayed: { addListener() {} } },
    tabs: { async query() { return []; }, async sendMessage() {} },
    messageDisplayAction: {
      onClicked: { addListener() {} },
      async setBadgeText() {}, async setBadgeBackgroundColor() {}, async setTitle() {}
    },
    runtime: { getURL() { return "moz-extension://test/vendor/public_suffix_list.dat"; },
      onMessage: { addListener(listener) { onMessage = listener; } },
      async openOptionsPage() {} },
    i18n: { getMessage(key) { return key; } }
  };
  const context = vm.createContext({ messenger, LinkGuardPolicy: policy,
    LinkGuardImport: listImport, LinkGuardDomainScope: domainScope,
    LinkGuardRegex: safeRegex, LinkGuardWarnings: warnings,
    fetch: async (url, options) => {
      if (!String(url).includes("public_suffix_list")) {
        remote.calls.push(String(url));
        if (!remote.handler) throw new Error("no remote handler");
        return remote.handler(String(url), options);
      }
      return { ok: true, text: async () => "com\nde\nuk\nco.uk\nio\ngithub.io\n" };
    },
    console, URL, Promise, Set, Object });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../background.js"), "utf8"), context);
  const send = (message) => onMessage(message, { tab: { id: 1 } });
  return { local, send, remote, context };
}

test("legacy host list is not silently approved and hostnames do not inherit", async () => {
  const h = harness();
  let state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.allowedHosts], []);
  state = await h.send({ type: "link-guard-decision", host: "login.google.de",
    decision: "permanent" });
  assert.deepEqual([...state.allowedHosts], ["login.google.de"]);
  assert.ok(!state.allowedHosts.includes("google.de"));
  assert.ok(!state.allowedHosts.includes("a.login.google.de"));
});

test("temporary approvals are not accepted or stored by the background", async () => {
  const h = harness();
  await assert.rejects(h.send({ type: "link-guard-decision", host: "example.com",
    decision: "temporary" }));
  assert.deepEqual([...(await h.send({ type: "link-guard-state" })).allowedHosts], []);
});

test("legacy preset settings cannot silently approve a hostname", async () => {
  const h = harness();
  assert.deepEqual([...(await h.send({ type: "link-guard-state" })).allowedHosts], []);
  h.local.enabledPresets = ["news"];
  h.local.presetOverrides = { news: ["login.google.de"] };
  const state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.allowedHosts], []);
  assert.deepEqual([...state.trustedDomains], []);
});

test("imported lists cannot grant access until enabled, and block wins", async () => {
  const h = harness();
  h.local.importedLists = [{ id: "12345678-1234-1234-1234-123456789abc",
    name: "Example", category: "other", hosts: ["example.org"],
    sourceUrl: "https://lists.example.org/list.json", enabled: false }];
  assert.ok(!has((await h.send({ type: "link-guard-state" })).allowedHosts, "example.org"));
  h.local.importedLists[0].enabled = true;
  assert.ok(has((await h.send({ type: "link-guard-state" })).allowedHosts, "example.org"));
  const state = await h.send({ type: "link-guard-decision", host: "example.org", decision: "block" });
  assert.ok(!has(state.allowedHosts, "example.org"));
});

test("whole-domain approval is separate from exact approval and uses public suffix rules", async () => {
  const h = harness();
  assert.equal(await h.send({ type: "link-guard-scope", host: "login.google.de" }), "google.de");
  assert.equal(await h.send({ type: "link-guard-scope", host: "alice.github.io" }), "alice.github.io");
  assert.equal(await h.send({ type: "link-guard-scope", host: "login.unknown.invalid" }), null);
  const state = await h.send({ type: "link-guard-decision", host: "login.google.de",
    decision: "permanent", scope: "domain" });
  assert.ok(state.broadAllowedDomains.includes("google.de"));
  assert.ok(!state.customAllowedHosts.includes("login.google.de"));
  assert.equal(await h.send({ type: "link-guard-validate-broad", hosts: ["co.uk"] }), "co.uk");
});

// Message pages compare a domain named in link text with the destination by registrable
// domain. Anything that is not a hostname under a known suffix has no root.
test("registrable domains for link text are looked up against public suffix rules", async () => {
  const h = harness();
  const pairs = await h.send({ type: "link-guard-roots", hosts: ["sparkasse.de",
    "www.sparkasse.de", "login.example.co.uk", "datei.pdf", "co.uk", "192.0.2.1",
    "__proto__", "constructor", 42] });
  assert.deepEqual(new Map(pairs), new Map([["sparkasse.de", "sparkasse.de"],
    ["www.sparkasse.de", "sparkasse.de"], ["login.example.co.uk", "example.co.uk"],
    ["datei.pdf", null], ["co.uk", null], ["192.0.2.1", null], ["__proto__", null],
    ["constructor", null]]));
  await assert.rejects(h.send({ type: "link-guard-roots",
    hosts: Array.from({ length: 501 }, (_, i) => `h${i}.example.de`) }));
  await assert.rejects(h.send({ type: "link-guard-roots", hosts: "sparkasse.de" }));
});

test("block decision asks for exact or registrable-domain scope", async () => {
  const h = harness();
  await h.send({ type: "link-guard-decision", host: "login.google.de",
    decision: "block", scope: "exact" });
  let state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.blockedHosts], ["login.google.de"]);
  assert.deepEqual([...state.blockedDomains], []);

  await h.send({ type: "link-guard-decision", host: "login.google.de",
    decision: "block", scope: "domain" });
  state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.blockedDomains], ["google.de"]);
  await assert.rejects(h.send({ type: "link-guard-decision", host: "accounts.google.de",
    decision: "permanent", scope: "exact" }));
  await assert.rejects(h.send({ type: "link-guard-decision", host: "co.uk",
    decision: "block", scope: "domain" }));
  await assert.rejects(h.send({ type: "link-guard-decision", host: "google.de",
    decision: "block", scope: "invalid" }));
});

test("whole-domain blocks remove local approvals but never widen a private suffix", async () => {
  const h = harness();
  await h.send({ type: "link-guard-decision", host: "login.google.de",
    decision: "permanent", scope: "exact" });
  await h.send({ type: "link-guard-decision", host: "www.google.de",
    decision: "permanent", scope: "domain" });
  await h.send({ type: "link-guard-decision", host: "alice.github.io",
    decision: "block", scope: "domain" });
  await h.send({ type: "link-guard-decision", host: "login.google.de",
    decision: "block", scope: "domain" });
  const state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.blockedDomains], ["alice.github.io", "google.de"]);
  assert.deepEqual([...state.customAllowedHosts], []);
  assert.deepEqual([...state.broadAllowedDomains], []);
  assert.ok(!has(state.blockedDomains, "github.io"));
});

test("whole-domain blocks override imported hosts and later whole-domain approval", async () => {
  const h = harness();
  h.local.importedLists = [{ id: "12345678-1234-1234-1234-123456789abc",
    name: "Example", category: "other", hosts: ["google.de", "login.google.de"],
    sourceUrl: "", enabled: true }];
  await h.send({ type: "link-guard-decision", host: "login.google.de",
    decision: "block", scope: "domain" });
  let state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.allowedHosts], []);
  assert.deepEqual([...state.blockedDomains], ["google.de"]);

  await h.send({ type: "link-guard-decision", host: "login.google.de",
    decision: "permanent", scope: "domain" });
  state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.blockedDomains], []);
  assert.ok(state.broadAllowedDomains.includes("google.de"));
});

test("shared publishing hosts cannot request broad approval through background messages", async () => {
  const h = harness();
  await assert.rejects(h.send({ type: "link-guard-decision", host: "docs.google.com",
    decision: "permanent", scope: "domain" }));
  assert.deepEqual([...(await h.send({ type: "link-guard-state" })).broadAllowedDomains], []);
});

test("lookalike analysis flags a typo and IDN but not the approved domain", async () => {
  const h = harness();
  await h.send({ type: "link-guard-decision", host: "google.de", decision: "permanent" });
  const result = await h.send({ type: "link-guard-analyze",
    hosts: ["google.de", "gogle.de", "xn--ggle-0qa.de"] });
  assert.equal(result["google.de"].kind, "none");
  assert.equal(result["gogle.de"].kind, "lookalike");
  assert.equal(result["gogle.de"].similarTo, "google.de");
  assert.equal(result["xn--ggle-0qa.de"].kind, "idn");
});

test("a typo in an unknown suffix is compared with approved domains", async () => {
  const h = harness();
  await h.send({ type: "link-guard-decision", host: "google.com", decision: "permanent" });
  const result = await h.send({ type: "link-guard-analyze", hosts: ["google.cmo"] });
  assert.equal(result["google.cmo"].kind, "lookalike");
  assert.equal(result["google.cmo"].similarTo, "google.com");
});

const blockList = (hosts, enabled = true, id = "12345678-1234-1234-1234-123456789abc") =>
  ({ id, name: "Blocks", category: "other", kind: "block", hosts, sourceUrl: "", enabled });

test("imported block lists block only while enabled and never enter the user's own rules", async () => {
  const h = harness();
  h.local.importedLists = [blockList(["phish.example.org", "*.google.de"], false)];
  let state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.blockedHosts], []);
  assert.deepEqual([...state.blockedDomains], []);

  h.local.importedLists[0].enabled = true;
  state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.blockedHosts], ["phish.example.org"]);
  assert.deepEqual([...state.blockedDomains], ["google.de"]);

  state = await h.send({ type: "link-guard-decision", host: "www.example.com", decision: "block" });
  assert.deepEqual([...state.blockedHosts], ["phish.example.org", "www.example.com"]);
  assert.deepEqual([...h.local.blockedHosts], ["www.example.com"]);
  assert.deepEqual([...(h.local.blockedDomains ?? [])], []);
});

test("imported block lists override approvals and imported allow lists", async () => {
  const h = harness();
  h.local.customAllowedHosts = ["login.google.de", "ok.example.org"];
  h.local.broadAllowedDomains = ["google.de"];
  h.local.importedLists = [blockList(["ok.example.org", "*.google.de"]),
    { id: "22345678-1234-1234-1234-123456789abc", name: "Allow", category: "other",
      kind: "allow", hosts: ["www.google.de", "fine.example.org"], sourceUrl: "", enabled: true }];
  const state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.allowedHosts], ["fine.example.org"]);
  assert.ok(has(state.blockedHosts, "ok.example.org"));
  assert.ok(state.blockedDomains.includes("google.de"));
});

test("a wildcard that is not a registrable domain in an imported block list is ignored", async () => {
  const h = harness();
  h.local.importedLists = [blockList(["*.co.uk", "*.github.io", "*.unknown.invalid", "*.google.de"])];
  const state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.blockedDomains], ["google.de"]);
});

test("approving a host blocked by an imported list is refused instead of silently ignored", async () => {
  const h = harness();
  h.local.importedLists = [blockList(["phish.example.org", "*.google.de"])];
  await assert.rejects(h.send({ type: "link-guard-decision", host: "phish.example.org",
    decision: "permanent", scope: "exact" }), /imported list/);
  await assert.rejects(h.send({ type: "link-guard-decision", host: "login.google.de",
    decision: "permanent", scope: "exact" }));
  await assert.rejects(h.send({ type: "link-guard-decision", host: "www.google.de",
    decision: "permanent", scope: "domain" }), /imported list/);
  assert.deepEqual([...(h.local.customAllowedHosts ?? [])], []);
  assert.deepEqual([...(h.local.broadAllowedDomains ?? [])], []);
  // Other hosts, and the user's own blocks, are unaffected.
  const state = await h.send({ type: "link-guard-decision", host: "other.example.org",
    decision: "permanent", scope: "exact" });
  assert.ok(has(state.allowedHosts, "other.example.org"));
});

const SOURCE = "https://lists.example.org/block.json";
const remoteResponse = (body, url = SOURCE) => {
  const data = new TextEncoder().encode(JSON.stringify(body));
  return { ok: true, url, headers: { get: name => name === "content-type" ? "application/json" : null },
    body: { getReader() { let done = false; return { async read() {
      if (done) return { done: true }; done = true; return { done: false, value: data };
    } }; } } };
};
const remoteList = (extra = {}) => ({ ...blockList(["old.example.org"]), sourceUrl: SOURCE,
  autoRefresh: true, refreshedAt: 1, refreshStatus: "ok", ...extra });
// Wait for the startup run, ask for the state (which starts a run) and wait for that run.
const settle = async h => {
  await vm.runInContext("refreshPromise", h.context);
  await h.send({ type: "link-guard-state" });
  await vm.runInContext("refreshPromise", h.context);
  return h.send({ type: "link-guard-state" });
};

test("an enabled auto-refresh blocklist is replaced by the fetched hosts and stays enabled", async () => {
  const h = harness();
  h.local.importedLists = [remoteList()];
  h.remote.handler = async url => remoteResponse({ format: "link-guard-hosts", version: 1,
    kind: "block", name: "Renamed by source", category: "news",
    hosts: ["new.example.org", "*.google.de"] }, url);
  const state = await settle(h);
  const [list] = h.local.importedLists;
  assert.deepEqual([...list.hosts], ["*.google.de", "new.example.org"]);
  assert.equal(list.name, "Blocks");
  assert.equal(list.enabled, true);
  assert.equal(list.refreshStatus, "ok");
  assert.ok(list.refreshedAt > 1);
  assert.deepEqual([...state.blockedHosts], ["new.example.org"]);
  assert.deepEqual([...state.blockedDomains], ["google.de"]);
});

test("auto-refresh skips lists that are disabled, not due, not opted in or not blocklists", async () => {
  const h = harness();
  h.remote.handler = async url => remoteResponse({ format: "link-guard-hosts", version: 1,
    kind: "block", name: "X", category: "other", hosts: ["new.example.org"] }, url);
  const id = n => `${n}2345678-1234-1234-1234-123456789abc`;
  h.local.importedLists = [
    remoteList({ id: id(1), enabled: false }),
    remoteList({ id: id(2), refreshedAt: Date.now() }),
    remoteList({ id: id(3), autoRefresh: false }),
    { ...remoteList({ id: id(4) }), kind: "allow", hosts: ["old.example.org"] }
  ];
  await settle(h);
  assert.deepEqual(h.remote.calls, []);
  assert.ok(h.local.importedLists.every(list => !has(list.hosts, "new.example.org")));
});

test("auto-refresh is on by default for a remote blocklist and can be switched off per list", async () => {
  const h = harness();
  const { autoRefresh: _omitted, ...unset } = remoteList();
  h.local.importedLists = [unset, remoteList({ id: "22345678-1234-1234-1234-123456789abc",
    autoRefresh: false })];
  h.remote.handler = async url => remoteResponse({ format: "link-guard-hosts", version: 1,
    kind: "block", name: "X", category: "other", hosts: ["new.example.org"] }, url);
  await settle(h);
  const [first, second] = h.local.importedLists;
  assert.deepEqual([...first.hosts], ["new.example.org"]);
  assert.deepEqual([...second.hosts], ["old.example.org"]);
  assert.equal(h.remote.calls.length, 1);
});

test("a failed or type-changing auto-refresh keeps the stored list and delays the retry", async () => {
  const h = harness();
  h.local.importedLists = [remoteList()];
  await settle(h);
  let [list] = h.local.importedLists;
  assert.equal(list.refreshStatus, "failed");
  assert.deepEqual([...list.hosts], ["old.example.org"]);
  assert.equal(list.enabled, true);
  const calls = h.remote.calls.length;
  await settle(h);
  assert.equal(h.remote.calls.length, calls, "no retry within the hour");

  h.local.importedLists = [remoteList()];
  h.remote.handler = async url => remoteResponse({ format: "link-guard-hosts", version: 1,
    kind: "allow", name: "X", category: "other", hosts: ["evil.example.org"] }, url);
  await settle(h);
  [list] = h.local.importedLists;
  assert.equal(list.refreshStatus, "kindChanged");
  assert.deepEqual([...list.hosts], ["old.example.org"]);
  assert.ok(!has((await h.send({ type: "link-guard-state" })).allowedHosts, "evil.example.org"));
});

test("an imported block cannot shrink the lookalike references of approved domains", async () => {
  const h = harness();
  await h.send({ type: "link-guard-decision", host: "login.bank.com", decision: "permanent" });
  h.local.importedLists = [blockList(["login.bank.com", "*.bank.com"])];
  const state = await h.send({ type: "link-guard-state" });
  assert.ok(!has(state.allowedHosts, "login.bank.com"), "still blocked");
  assert.ok(has(state.trustedDomains, "bank.com"));
  const result = await h.send({ type: "link-guard-analyze", hosts: ["bnak.com"] });
  assert.equal(result["bnak.com"].kind, "lookalike");
  // The user's own block still removes the approval and its reference, as before.
  await h.send({ type: "link-guard-decision", host: "login.bank.com", decision: "block" });
  h.local.importedLists = [];
  assert.ok(!has((await h.send({ type: "link-guard-state" })).trustedDomains, "bank.com"));
});

test("the public state does not carry the imported lists themselves", async () => {
  const h = harness();
  h.local.importedLists = [blockList(["a.example.org"])];
  const state = await h.send({ type: "link-guard-state" });
  assert.equal(state.importedLists, undefined);
  assert.equal(state.ownBlockedHosts, undefined);
  assert.deepEqual([...state.blockedHosts], ["a.example.org"]);
});

const autoResponse = hosts => async url => remoteResponse({ format: "link-guard-hosts",
  version: 1, kind: "block", name: "X", category: "other", hosts }, url);
const manyHosts = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix}${i}.example.org`);

test("an automatic update that would block an approved host or domain is held for review", async () => {
  for (const hosts of [["old.example.org", "login.google.de"], ["old.example.org", "*.google.de"],
    ["old.example.org", "www.shop.com"]]) {
    const h = harness();
    h.local.customAllowedHosts = ["login.google.de"];
    h.local.broadAllowedDomains = ["shop.com"];
    h.local.importedLists = [remoteList()];
    h.remote.handler = autoResponse(hosts);
    await settle(h);
    const [list] = h.local.importedLists;
    assert.equal(list.refreshStatus, "review", hosts.join());
    assert.deepEqual([...list.hosts], ["old.example.org"]);
    assert.equal(list.enabled, true);
  }
});

test("an automatic update that adds many entries, doubles the list or gutts it is held for review", async () => {
  const big = manyHosts(10, "keep");
  for (const [old, next] of [
    [["old.example.org"], manyHosts(60, "new")],
    [["old.example.org"], manyHosts(30, "new")],
    [big, manyHosts(3, "keep")]]) {
    const h = harness();
    h.local.importedLists = [remoteList({ hosts: old })];
    h.remote.handler = autoResponse(next);
    await settle(h);
    const [list] = h.local.importedLists;
    assert.equal(list.refreshStatus, "review");
    assert.deepEqual([...list.hosts], old);
  }
  // A modest change that touches nothing approved is still applied automatically.
  const h = harness();
  h.local.customAllowedHosts = ["login.google.de"];
  h.local.importedLists = [remoteList({ hosts: big })];
  h.remote.handler = autoResponse([...big.slice(1), "added.example.org"]);
  await settle(h);
  assert.equal(h.local.importedLists[0].refreshStatus, "ok");
  assert.ok(has(h.local.importedLists[0].hosts, "added.example.org"));
});

test("no storage work or fetch happens when no enabled list opted in to auto-refresh", async () => {
  const h = harness();
  let writes = 0;
  const original = h.local;
  h.local.importedLists = [remoteList({ autoRefresh: false }), blockList(["a.example.org"], true,
    "22345678-1234-1234-1234-123456789abc")];
  h.remote.handler = autoResponse(["x.example.org"]);
  const before = JSON.stringify(original.importedLists);
  await settle(h);
  assert.deepEqual(h.remote.calls, []);
  assert.equal(JSON.stringify(original.importedLists), before);
});

test("warning settings are cleaned before they reach message pages", async () => {
  const h = harness();
  const rule = (label, pattern) => ({ label, target: "url", pattern });
  h.local.disabledWarnings = ["idn", "bogus"];
  h.local.customWarnings = [rule("Own", "login"), rule("Broken", "(a)\\1"), rule("x\u202e", "a")];
  h.local.warningLists = [
    { id: "12345678-1234-1234-1234-123456789001", name: "Enabled", rules: [rule("From list", "verify")],
      sourceUrl: "", enabled: true },
    { id: "12345678-1234-1234-1234-123456789002", name: "Disabled", rules: [rule("Off", "off")],
      sourceUrl: "", enabled: false }];
  h.local.customAllowedHosts = ["shop.example.com"];
  const state = await h.send({ type: "link-guard-state" });
  assert.deepEqual([...state.disabledWarnings], ["idn"]);
  assert.deepEqual(JSON.parse(JSON.stringify(state.warningRules)), [
    { label: "Own", target: "url", pattern: "login", source: "" },
    { label: "From list", target: "url", pattern: "verify", source: "Enabled" }]);
  // Warning rules never change what is approved.
  assert.deepEqual([...state.allowedHosts], ["shop.example.com"]);
  assert.equal(state.warningLists, undefined);
});
