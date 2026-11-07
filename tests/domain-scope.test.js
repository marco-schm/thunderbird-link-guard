const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const scope = require("../domain-scope.js");

const data = fs.readFileSync(path.join(__dirname, "../vendor/public_suffix_list.dat"), "utf8");
const rules = scope.parsePublicSuffixList(data);

test("registrable scopes respect ICANN and private public suffixes", () => {
  assert.equal(scope.registrableDomain("login.google.de", rules), "google.de");
  assert.equal(scope.registrableDomain("a.b.example.co.uk", rules), "example.co.uk");
  assert.equal(scope.registrableDomain("alice.github.io", rules), "alice.github.io");
  assert.equal(scope.registrableDomain("github.io", rules), null);
  assert.equal(scope.registrableDomain("google.unknowninvalid", rules), null);
});
