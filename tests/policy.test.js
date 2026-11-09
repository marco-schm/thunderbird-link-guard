const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeHost, parseHostList, parseRuleList, inspectLink, resolveHref,
  lookalikeDomain, isInternationalizedHost, isSharedContentHost,
  apparentHost, bareHostCandidate } = require("../policy.js");

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
    ["https://192.0.2.1/", "ipAddress"]]) {
    const result = inspectLink(url);
    assert.equal(result.kind, "web", url);
    assert.ok(result.risks.includes(risk), url);
  }
});

// An explicit port is not a warning: the link follows the approval of its host.
test("a port does not make a link risky", () => {
  for (const url of ["https://example.com:8443/", "http://example.com:8080/x"]) {
    const result = inspectLink(url);
    assert.deepEqual(result.hosts, ["example.com"], url);
    assert.equal(result.risks, undefined, url);
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

// The most natural phishing text names a domain without scheme or "www.". Whether a
// candidate is a real domain is decided later against the Public Suffix List.
test("link text naming a bare domain yields a hostname candidate", () => {
  for (const [text, host] of [
    ["sparkasse.de", "sparkasse.de"], ["PAYPAL.COM", "paypal.com"],
    ["login.microsoftonline.com", "login.microsoftonline.com"],
    ["Besuchen Sie firma.de.", "firma.de"], ["firma.de/konto", "firma.de"],
    ["bücher.de", "xn--bcher-kva.de"], ["datei.pdf", "datei.pdf"]
  ]) assert.equal(bareHostCandidate(text), host, text);
  for (const text of ["Konto prüfen", "Version 1.2.3", "z.B. heute", "info@example.org",
    "a.b", "", "1.2.3.4", `${"x".repeat(70)}.de`])
    assert.equal(bareHostCandidate(text), null, text);
  assert.equal(bareHostCandidate(null), null);
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

// The lookalike check looks up every one-edit variant of a candidate instead of comparing
// it with each trusted domain. It must decide exactly like the earlier pairwise rule,
// which is kept here as the reference, and it must see every trusted domain.
test("lookalike lookup decides like the pairwise rule, for any number of trusted domains", () => {
  function oneEditOrSwap(a, b) {
    if (a === b || Math.abs(a.length - b.length) > 1) return false;
    let left = 0, right = 0, edits = 0;
    while (left < a.length && right < b.length) {
      if (a[left] === b[right]) { left++; right++; continue; }
      if (++edits > 1) return false;
      if (a.length === b.length && left + 1 < a.length &&
          a[left] === b[right + 1] && a[left + 1] === b[right]) { left += 2; right += 2; }
      else if (a.length > b.length) left++;
      else if (b.length > a.length) right++;
      else { left++; right++; }
    }
    return edits + (left < a.length || right < b.length ? 1 : 0) === 1;
  }
  function reference(candidate, trusted) {
    const labels = candidate.split(".");
    if (labels.length < 2 || labels[0].length < 4) return false;
    for (const other of trusted) {
      if (other === candidate) continue;
      if (oneEditOrSwap(candidate, other)) return true;
      const parts = other.split(".");
      if (parts.length === labels.length && parts[0].length >= 4 &&
          labels.slice(1).join(".") === parts.slice(1).join(".") &&
          oneEditOrSwap(labels[0], parts[0])) return true;
    }
    return false;
  }
  let seed = 11;
  const random = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789-.";
  const word = () => Array.from({ length: 3 + random(9) }, () => alphabet[random(36)]).join("");
  const trusted = Array.from({ length: 300 }, () => `${word()}.${["com", "de", "co.uk", "org"][random(4)]}`);
  for (let k = 0; k < 3000; k++) {
    const base = trusted[random(trusted.length)];
    const i = random(base.length);
    const c = alphabet[random(alphabet.length)];
    const candidate = [base.slice(0, i) + base.slice(i + 1), base.slice(0, i) + c + base.slice(i),
      base.slice(0, i) + c + base.slice(i + 1),
      i + 1 < base.length ? base.slice(0, i) + base[i + 1] + base[i] + base.slice(i + 2) : base,
      `${word()}.${["com", "net"][random(2)]}`][k % 5];
    const expected = reference(candidate, trusted);
    const actual = lookalikeDomain(candidate, trusted);
    assert.equal(Boolean(actual), expected, candidate);
    if (actual) assert.ok(trusted.includes(actual) && actual !== candidate, candidate);
  }
  // No cap: a trusted domain far down a long list (here at position 30,000; the old check
  // stopped at 10,000) is still a reference.
  const many = Array.from({ length: 30000 }, (_, i) => `brand${i}shop.com`);
  assert.equal(lookalikeDomain("brand29999shpo.com", many), "brand29999shop.com");
  assert.equal(lookalikeDomain("unrelatedname.org", many), null);
});

// Own rule cards stay at 500 entries; imported lists, edited on the settings page, pass
// their own limit of 5,000.
test("host and rule lists stop at the limit they are given", () => {
  const lines = count => Array.from({ length: count }, (_, i) => `host${i}.example.org`).join("\n");
  assert.deepEqual(parseHostList(lines(501)).errors, ["limit"]);
  assert.deepEqual(parseHostList(lines(500)).errors, []);
  assert.equal(parseHostList(lines(5000), 5000).hosts.length, 5000);
  assert.deepEqual(parseHostList(lines(5001), 5000).errors, ["limit"]);
  assert.deepEqual(parseRuleList(lines(501)).errors, ["limit"]);
  assert.equal(parseRuleList(`${lines(4999)}\n*.example.net`, false, 5000).domains.length, 1);
  assert.deepEqual(parseRuleList(`${lines(5000)}\n*.example.net`, false, 5000).errors, ["limit"]);
});
