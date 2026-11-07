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
