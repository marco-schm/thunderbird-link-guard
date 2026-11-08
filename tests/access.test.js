const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectLink } = require("../policy.js");
const { linkAllowed } = require("../access.js");

const state = {
  allowedHosts: ["www.google.com", "docs.google.com", "www.reuters.com"],
  customAllowedHosts: ["www.google.com", "docs.google.com", "www.reuters.com"],
  broadAllowedDomains: [], blockedHosts: []
};
const noWarning = () => ({ kind: "none" });
const allowed = (url, temporary = []) => linkAllowed(
  inspectLink(url), state, new Set(temporary), noWarning, true);

// A `<base href>` plus `href="#x"` used to be classified as an in-message fragment,
// which skipped the host decision entirely.
test("a base-relative fragment needs the same approval as any web link", () => {
  const base = "https://base-evil.example.net/landing";
  const inspection = inspectLink("#x", "", base);
  assert.equal(inspection.kind, "web");
  assert.equal(linkAllowed(inspection, state, new Set(), noWarning, true), false);
  assert.equal(linkAllowed(inspection, state, new Set(["base-evil.example.net"]),
    noWarning, true), true);
  const approved = { ...state,
    allowedHosts: [...state.allowedHosts, "base-evil.example.net"],
    customAllowedHosts: [...state.customAllowedHosts, "base-evil.example.net"] };
  assert.equal(linkAllowed(inspection, approved, new Set(), noWarning, true), true);
  // An approval of the host the text advertises does not cover the real destination.
  const wrongHost = { ...state,
    allowedHosts: [...state.allowedHosts, "landing.example.org"],
    customAllowedHosts: [...state.customAllowedHosts, "landing.example.org"] };
  assert.equal(linkAllowed(inspection, wrongHost, new Set(), noWarning, true), false);
});

test("branded tracking paths follow the normal host approval", () => {
  const url = "https://url8792.mail.anthropic.com/ls/click?upn=u001.synthetic";
  const brandedState = { ...state,
    allowedHosts: [...state.allowedHosts, "url8792.mail.anthropic.com"],
    customAllowedHosts: [...state.customAllowedHosts, "url8792.mail.anthropic.com"] };
  assert.equal(inspectLink(url).risks, undefined);
  assert.equal(linkAllowed(inspectLink(url), brandedState, new Set(), noWarning, true), true);
});

test("user-hosted content follows the normal host approval", () => {
  assert.equal(allowed("https://docs.google.com/document/d/example"), true);
});

test("public short links require per-message approval even when listed", () => {
  const withRiskHosts = { ...state,
    allowedHosts: [...state.allowedHosts, "bit.ly", "tinyurl.com"],
    customAllowedHosts: [...state.customAllowedHosts, "bit.ly", "tinyurl.com"] };
  for (const host of ["bit.ly", "tinyurl.com"]) {
    const inspection = inspectLink(`https://${host}/opaque`);
    assert.equal(linkAllowed(inspection, withRiskHosts, new Set(), noWarning, true), false);
    assert.equal(linkAllowed(inspection, withRiskHosts, new Set([host]), noWarning, true), true);
  }
});

test("ordinary exact HTTPS approval still opens non-redirect links", () => {
  assert.equal(allowed("https://www.reuters.com/article/example"), true);
  assert.equal(allowed("https://www.reuters.com/redirect?token=opaque"), true);
});

test("broad provider approval cannot approve shared content hosts", () => {
  const broad = { ...state, allowedHosts: [], customAllowedHosts: [],
    broadAllowedDomains: ["google.com", "example.com"] };
  assert.equal(linkAllowed(inspectLink("https://www.google.com/"), broad,
    new Set(), noWarning, true), true);
  assert.equal(linkAllowed(inspectLink("https://docs.google.com/document/d/id"), broad,
    new Set(), noWarning, true), false);
  broad.customAllowedHosts = ["docs.google.com"];
  assert.equal(linkAllowed(inspectLink("https://docs.google.com/document/d/id"), broad,
    new Set(), noWarning, true), true);
});

// A block wins over every approval, including one for the current message: a blocked
// host has to be unblocked before its links open.
test("whole-domain block overrides exact, broad and per-message approvals", () => {
  const blocked = { ...state, allowedHosts: ["login.google.com"],
    customAllowedHosts: ["login.google.com"],
    broadAllowedDomains: ["google.com"], blockedDomains: ["google.com"] };
  const target = inspectLink("https://login.google.com/reset");
  assert.equal(linkAllowed(target, blocked, new Set(), noWarning, true), false);
  assert.equal(linkAllowed(inspectLink("https://google.com/"), blocked,
    new Set(), noWarning, true), false);
  assert.equal(linkAllowed(target, blocked, new Set(["login.google.com"]), noWarning, true), false);
  const exactBlock = { ...state, blockedHosts: ["bit.ly"] };
  assert.equal(linkAllowed(inspectLink("https://bit.ly/x"), exactBlock, new Set(["bit.ly"]),
    noWarning, true), false);
  assert.equal(linkAllowed(inspectLink("https://google.org/"), blocked,
    new Set(), noWarning, true), false);
});

// Code in a link attacks the site it leads to, usually one the user trusts. A lasting
// approval of that host must not be enough; only an approval for this message is.
test("a link with code opens only after an approval for this message", () => {
  const href = "https://www.google.com/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E";
  const inspection = inspectLink(href);
  assert.ok(inspection.risks.includes("scriptInUrl"));
  // www.google.com is approved exactly in `state`
  assert.equal(linkAllowed(inspection, state, new Set(), noWarning, true), false);
  assert.equal(linkAllowed(inspection, state, new Set(["www.google.com"]), noWarning, true), true);
});
