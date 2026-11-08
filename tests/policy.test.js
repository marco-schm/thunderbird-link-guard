const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeHost, parseHostList, parseRuleList, inspectLink, resolveHref,
  lookalikeDomain, isInternationalizedHost, isSharedContentHost,
  apparentHost } = require("../policy.js");

// A displayed message's own base URI. A `<base href>` in the message replaces it.
const MESSAGE_BASE = "mailbox:///tmp/example.eml?type=application/x-message-display";

test("host approval is exact in both directions", () => {
  assert.equal(normalizeHost("Login.Google.De."), "login.google.de");
  assert.equal(inspectLink("https://login.google.de/reset").hosts[0], "login.google.de");
  assert.equal(inspectLink("https://google.de/reset").hosts[0], "google.de");
  assert.notEqual(inspectLink("https://login.google.de/reset").hosts[0],
    inspectLink("https://google.de/reset").hosts[0]);
});

test("host list rejects URL syntax, wildcards, IP addresses and duplicates", () => {
  const result = parseHostList("Login.Google.De\nlogin.google.de\n*.google.de\nhttps://google.de\n127.0.0.1");
  assert.deepEqual(result.hosts, ["login.google.de"]);
  assert.deepEqual(result.errors, [3, 4, 5]);
});

test("editable rules distinguish exact hosts from whole-domain wildcards", () => {
  const rules = parseRuleList("login.google.de\n*.Google.De\n*.co.uk\n*.*.google.de\nhttps://google.de");
  assert.deepEqual(rules.hosts, ["login.google.de"]);
  assert.deepEqual(rules.domains, ["co.uk", "google.de"]);
  assert.deepEqual(rules.errors, [4, 5]);
  assert.deepEqual(parseRuleList("google.de\n*.google.de", true), {
    hosts: [], domains: ["google.de"], errors: [1]
  });
});

test("ordinary HTTPS links expose their exact host", () => {
  assert.deepEqual(inspectLink("https://accounts.google.com/reset?token=secret"), {
    kind: "web", host: "accounts.google.com", hosts: ["accounts.google.com"], reason: ""
  });
});

test("a deceptive visible URL gets a conspicuous explicit-approval risk", () => {
  const result = inspectLink("https://evil.example/login", "https://accounts.google.com/");
  assert.equal(result.kind, "web");
  assert.ok(result.risks.includes("textMismatch"));
});

test("HTTP links keep their host and are treated like HTTPS links", () => {
  const result = inspectLink("http://www.anthropic.com/");
  assert.equal(result.kind, "web");
  assert.deepEqual(result.hosts, ["www.anthropic.com"]);
  assert.equal(result.risks, undefined);
  assert.equal(inspectLink("http://example.com/?next=/settings").kind, "web");
  assert.equal(inspectLink("https://example.com/?next=http%3A%2F%2Fother.example%2F").risks,
    undefined);
});

test("web links with risky details require explicit approval", () => {
  for (const [url, risk] of [["https://user@example.com/", "credentials"],
    ["https://192.0.2.1/", "ipAddress"],
    ["https://example.com:8443/", "unusualPort"]]) {
    const result = inspectLink(url);
    assert.equal(result.kind, "web", url);
    assert.ok(result.risks.includes(risk), url);
  }
});

test("non-web and malformed targets remain blocked", () => {
  for (const url of ["javascript:alert(1)", "/relative/path"]) {
    assert.equal(inspectLink(url).kind, "blocked", url);
  }
});

test("only public shortener hosts trigger the short-link warning", () => {
  for (const host of ["bit.ly", "tinyurl.com", "t.co", "rebrand.ly",
    "customer.s.gy", "is.gd", "v.gd", "tiny.cc", "cutt.ly"]) {
    assert.ok(inspectLink(`https://${host}/example`).risks.includes("shortLink"), host);
  }
  for (const url of [
    "https://url8792.mail.anthropic.com/ls/click?upn=u001.synthetic",
    "https://click.pstmrk.it/synthetic", "https://site.pages.dev/",
    "https://www.google.com/url?next=https%3A%2F%2Fexample.org%2F"
  ]) {
    assert.equal(inspectLink(url).risks, undefined, url);
  }
});

test("non-web actions and in-message fragments are outside web domain approval", () => {
  for (const url of ["mailto:help@example.com", "tel:+491234", "cid:image@example.com", "#part"])
    assert.equal(inspectLink(url).kind, "skip", url);
  // Still in-message once the message's own base URI is taken into account.
  for (const url of ["#part", "", "#"])
    assert.equal(inspectLink(url, "", MESSAGE_BASE).kind, "skip", JSON.stringify(url));
});

// Thunderbird opens the URL a link resolves to, so a `<base href>` makes an empty href
// or a bare fragment point at the web. Classifying the raw attribute let those through
// as in-message anchors, with no approval, no warning and an intact href.
test("a message base URI cannot turn a fragment into an unchecked web link", () => {
  const base = "https://base-evil.example.net/landing";
  for (const href of ["#x", "", "#"]) {
    const result = inspectLink(href, "", base);
    assert.equal(result.kind, "web", JSON.stringify(href));
    assert.deepEqual(result.hosts, ["base-evil.example.net"], JSON.stringify(href));
  }
  // Relative and scheme-relative targets follow the same base.
  assert.deepEqual(inspectLink("/pfad", "", base).hosts, ["base-evil.example.net"]);
  assert.deepEqual(inspectLink("//other.example.net/p", "", base).hosts, ["other.example.net"]);
  // A base pointing back into the message keeps those targets out of the web.
  assert.equal(inspectLink("#x", "", MESSAGE_BASE).kind, "skip");
  assert.equal(inspectLink("/pfad", "", MESSAGE_BASE).kind, "blocked");
  // Absolute schemes are unaffected by the base.
  for (const href of ["mailto:help@example.com", "tel:+491234", "cid:image@example.com"])
    assert.equal(inspectLink(href, "", base).kind, "skip", href);
  assert.equal(inspectLink("javascript:alert(1)", "", base).kind, "blocked");
  assert.deepEqual(inspectLink("https://elsewhere.example.net/p", "", base).hosts,
    ["elsewhere.example.net"]);
});

test("the destination used for warning rules follows the base URI", () => {
  const base = "https://base-evil.example.net/landing";
  assert.equal(resolveHref("#x", base).href, "https://base-evil.example.net/landing#x");
  assert.equal(resolveHref("", base).href, "https://base-evil.example.net/landing");
  assert.equal(resolveHref("#x", MESSAGE_BASE).href, `${MESSAGE_BASE}#x`);
  assert.equal(resolveHref("https://example.org/p", base).href, "https://example.org/p");
  assert.equal(resolveHref("#x"), null);
  assert.equal(resolveHref(null, base), null);
});

test("lookalike matching catches single edits and adjacent swaps without suffix guessing", () => {
  for (const candidate of ["gogle.de", "gooogle.de", "googel.de", "goog1e.de"])
    assert.equal(lookalikeDomain(candidate, ["google.de"]), "google.de");
  assert.equal(lookalikeDomain("google.de", ["google.de"]), null);
  assert.equal(lookalikeDomain("google.com", ["google.de"]), null);
  assert.equal(lookalikeDomain("google.cmo", ["google.com"]), "google.com");
  assert.equal(isInternationalizedHost("xn--ggle-0qa.de"), true);
});

test("shared content hosts and descriptive link text are identified", () => {
  for (const host of ["docs.google.com", "alice.github.io", "team.pages.dev"])
    assert.equal(isSharedContentHost(host), true);
  assert.equal(isSharedContentHost("www.google.com"), false);
  assert.equal(apparentHost("Konto prüfen"), null);
  assert.equal(apparentHost("https://example.org/reset"), "example.org");
  assert.equal(apparentHost("Konto unter https://example.org/reset prüfen"), "example.org");
  assert.ok(inspectLink("https://other.invalid/", "Öffne https://example.org/")
    .risks.includes("textMismatch"));
});
