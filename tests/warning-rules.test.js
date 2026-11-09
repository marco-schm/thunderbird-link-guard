const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../policy.js");
const access = require("../access.js");
const warnings = require("../warning-rules.js");

const rule = (pattern, target = "url", label = "Rule") => ({ label, target, pattern });
const id = n => `12345678-1234-1234-1234-12345678900${n}`;

test("rules are validated strictly", () => {
  assert.deepEqual(warnings.parseRule(rule("/wp-admin/", "url", "  WordPress admin ")),
    { label: "WordPress admin", target: "url", pattern: "/wp-admin/" });
  for (const [bad, code] of [
    [rule("a", "path"), "ruleFormat"], [{ ...rule("a"), extra: true }, "ruleFormat"], [{ label: "x" }, "ruleFormat"],
    [rule("a", "url", ""), "labelInvalid"], [rule("a", "url", "x".repeat(61)), "labelInvalid"],
    [rule("a", "url", "safe‮"), "labelInvalid"], [rule("a", "url", "a​b"), "labelInvalid"],
    [rule("a", "url", "<b>"), "labelInvalid"], [rule("(a)\\1"), "regexUnsupported"], [rule(5), "regexSyntax"]
  ]) assert.throws(() => warnings.parseRule(bad), new RegExp(`^Error: ${code}$`), JSON.stringify(bad));
});

test("warning lists use their own strict schema and limits", () => {
  const list = { format: "link-guard-warnings", version: 1, name: "Phishing patterns", rules: [rule("login")] };
  assert.deepEqual(warnings.parseList(JSON.stringify(list)), { name: "Phishing patterns", rules: [rule("login")] });
  for (const bad of [{ ...list, format: "link-guard-hosts" }, { ...list, version: 2 }, { ...list, rules: [] },
    { ...list, extra: 1 }, { ...list, name: "‮name" }, { ...list, kind: "allow" }]) {
    assert.throws(() => warnings.parseList(JSON.stringify(bad)), /warningListFormat/);
  }
  assert.throws(() => warnings.parseList(JSON.stringify({ ...list, rules: Array(51).fill(rule("a")) })),
    /warningRuleLimit/);
  assert.throws(() => warnings.parseList(JSON.stringify({ ...list, rules: [rule("a"), rule("(?=a)")] })),
    error => error.message === "regexUnsupported" && error.rule === 2);
  assert.throws(() => warnings.parseList("x".repeat(65537)), /importTooLarge/);
});

test("stored settings are re-validated and only enabled lists apply", () => {
  assert.deepEqual(warnings.cleanDisabled(["idn", "bogus", "idn", "credentials"]), ["credentials", "idn"]);
  assert.deepEqual(warnings.cleanRules([rule("ok"), rule("(a)\\1"), "x"]), [rule("ok")]);
  const lists = warnings.cleanStoredLists([
    { id: id(1), name: "On", rules: [rule("on")], sourceUrl: "https://lists.example.org/w.json", enabled: true },
    { id: id(2), name: "Off", rules: [rule("off")], sourceUrl: "", enabled: false },
    { id: id(3), name: "Bad URL", rules: [rule("x")], sourceUrl: "http://lists.example.org/w.json", enabled: true },
    { id: "bad", name: "Bad id", rules: [rule("x")], enabled: true }
  ]);
  assert.deepEqual(lists.map(list => list.name), ["On", "Off"]);
  assert.deepEqual(warnings.effectiveRules([rule("own")], lists).map(r => [r.pattern, r.source]),
    [["own", ""], ["on", "On"]]);
  const many = Array.from({ length: 10 }, (_, n) => ({ name: `L${n}`, enabled: true, rules: Array(50).fill(rule("x")) }));
  assert.equal(warnings.effectiveRules(Array(50).fill(rule("own")), many).length, warnings.MAX_TOTAL_RULES);
});

test("settings switch built-in warnings off and custom rules add warnings", () => {
  const evaluator = warnings.createEvaluator([
    { ...rule("/wp-admin/"), source: "" }, { ...rule("(^|\\.)bank\\.", "host"), source: "List" },
    { ...rule("pay\\s*now", "text"), source: "" }]);
  const apply = (href, text, disabled = []) => warnings.applyWarnings(policy.inspectLink(href, text),
    { disabled: new Set(disabled), evaluator, href, text, budget: { steps: 1e6 } });
  assert.deepEqual(apply("https://x.org/%77p-admin/", "").risks, ["custom:0"]);
  assert.deepEqual(apply("https://login.bank.example/", "PAY NOW").risks, ["custom:1", "custom:2"]);
  assert.deepEqual(apply("https://a.example/", "https://b.example/").risks, ["textMismatch"]);
  assert.equal(apply("https://a.example/", "https://b.example/", ["textMismatch"]).risks, undefined);
  assert.deepEqual(apply("https://bit.ly/x", "", ["textMismatch"]).risks, ["shortLink"]);
  assert.equal(apply("https://bit.ly/x", "", ["shortLink"]).risks, undefined);
  assert.equal(apply("mailto:a@example.org", "").kind, "skip");
});

test("an exhausted budget fails closed with a warning", () => {
  const evaluator = warnings.createEvaluator([{ ...rule("never-there"), source: "" }]);
  const href = `https://example.org/${"a".repeat(5000)}`;
  const result = warnings.applyWarnings(policy.inspectLink(href, ""),
    { disabled: new Set(), evaluator, href, text: "", budget: { steps: 100 } });
  assert.deepEqual(result.risks, ["customSkipped"]);
  // Nothing partial was cached: with enough budget the link is checked normally.
  assert.equal(warnings.applyWarnings(policy.inspectLink(href, ""),
    { disabled: new Set(), evaluator, href, text: "", budget: { steps: 1e7 } }).risks, undefined);
});

test("a custom warning needs an exact approval and never grants access", () => {
  const evaluator = warnings.createEvaluator([{ ...rule("login"), source: "" }]);
  const href = "https://shop.example.org/login";
  const inspection = warnings.applyWarnings(policy.inspectLink(href, ""),
    { disabled: new Set(), evaluator, href, text: "", budget: { steps: 1e6 } });
  const state = { blockedHosts: [], blockedDomains: [], customAllowedHosts: [],
    allowedHosts: ["shop.example.org"], broadAllowedDomains: ["example.org"] };
  const none = () => ({ kind: "none", similarTo: "" });
  assert.equal(access.linkAllowed(inspection, state, new Set(), none, true), false);
  assert.equal(access.linkAllowed(inspection, { ...state, customAllowedHosts: ["shop.example.org"] },
    new Set(), none, true), true);
  assert.equal(access.linkAllowed(inspection, { ...state, allowedHosts: [] }, new Set(), none, true), false);
});

// The rule recommended in docs/warning-rules.md for an organisation's own name. It is
// tested here so the documentation cannot drift from what the engine does.
test("the documented company-name rule warns about lookalikes but not the domain itself", () => {
  const regex = require("../safe-regex.js");
  const cases = [
    [String.raw`[a-z0-9-]nullringresearch|nullringresearch([a-z0-9-]|\.([^d]|d[^e]|d$|de.))`,
      ["nullringresearch-support.de", "my-nullringresearch.de", "xnullringresearch.de",
        "nullringresearchs.de", "nullringresearch.com", "nullringresearch.net", "nullringresearch.dk",
        "nullringresearch.de.evil.example", "nullringresearch.dev", "NullRingResearch-Login.net"],
      ["nullringresearch.de", "www.nullringresearch.de", "mail.nullringresearch.de", "research.de"]],
    [String.raw`[a-z0-9-]example|example([a-z0-9-]|\.([^c]|c[^o]|co[^m]|c$|co$|com.))`,
      ["example-login.com", "my-example.com", "example.co", "example.co.uk", "example.com.evil.net",
        "example.net"],
      ["example.com", "www.example.com", "shop.example.com"]]
  ];
  for (const [pattern, warn, quiet] of cases) {
    const program = regex.compile(pattern);
    for (const host of warn) assert.equal(regex.test(program, host, { steps: 1e6 }), true, `${pattern}: ${host}`);
    for (const host of quiet) assert.equal(regex.test(program, host, { steps: 1e6 }), false, `${pattern}: ${host}`);
  }
});

// Host lists may be 512 KiB, but a warning list keeps its own 64 KiB limit, also while
// it is being downloaded.
test("a remote warning list stops downloading at its own size limit", async () => {
  let reads = 0;
  const chunk = new Uint8Array(16 * 1024).fill(32);
  const response = { ok: true, url: "https://lists.example.org/w.json",
    headers: { get(name) { return name === "content-type" ? "application/json" : null; } },
    body: { getReader() { return {
      async read() { reads++; return { done: false, value: chunk }; },
      async cancel() {}
    }; } } };
  await assert.rejects(warnings.fetchList(response.url, async () => response), /importTooLarge/);
  assert.equal(reads, warnings.MAX_BYTES / chunk.length + 1);
  const declared = { ...response, headers: { get(name) {
    return name === "content-type" ? "application/json" :
      name === "content-length" ? String(warnings.MAX_BYTES + 1) : null; } } };
  await assert.rejects(warnings.fetchList(response.url, async () => declared), /importTooLarge/);
});
