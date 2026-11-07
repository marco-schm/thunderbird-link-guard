const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const policy = require("../policy.js");
const listImport = require("../import-list.js");
const domainScope = require("../domain-scope.js");

function harness() {
  const local = { trustedHosts: ["old.example.com"] };
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
    tabs: { async sendMessage() {} },
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
    fetch: async () => ({ ok: true, text: async () => "com\nde\nuk\nco.uk\nio\ngithub.io\n" }),
    console, URL, Promise, Set, Object });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../background.js"), "utf8"), context);
  const send = (message) => onMessage(message, { tab: { id: 1 } });
  return { local, send };
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
  assert.ok(!(await h.send({ type: "link-guard-state" })).allowedHosts.includes("example.org"));
  h.local.importedLists[0].enabled = true;
  assert.ok((await h.send({ type: "link-guard-state" })).allowedHosts.includes("example.org"));
  const state = await h.send({ type: "link-guard-decision", host: "example.org", decision: "block" });
  assert.ok(!state.allowedHosts.includes("example.org"));
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
