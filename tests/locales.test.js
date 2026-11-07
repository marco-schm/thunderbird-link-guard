const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = language => JSON.parse(fs.readFileSync(
  path.join(__dirname, `../_locales/${language}/messages.json`), "utf8"));

test("German and English catalogs have the same nonempty keys", () => {
  const de = read("de");
  const en = read("en");
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
  for (const [key, entry] of Object.entries(de)) {
    assert.ok(entry.message, key);
    assert.ok(en[key].message, key);
  }
});

test("every manifest placeholder and code message key exists", () => {
  const catalog = read("de");
  const files = ["manifest.json", "background.js", "display.js", "options.js"];
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    for (const match of source.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
      assert.ok(catalog[match[1]], `${file}: ${match[1]}`);
    }
    for (const match of source.matchAll(/\b(?:t|getMessage)\(\s*["']([A-Za-z0-9_]+)["']/g)) {
      assert.ok(catalog[match[1]], `${file}: ${match[1]}`);
    }
  }
  for (const key of ["status_pending", "status_temporary", "status_permanent",
    "status_blocked", "reason_invalidUrl", "reason_badScheme", "reason_credentials",
    "reason_ipAddress", "reason_insecureHttp", "reason_unusualPort",
    "reason_textMismatch", "status_broad",
    ...["credentials", "ipAddress", "unusualPort", "textMismatch", "insecureHttp",
      "shortLink"]
      .flatMap(reason => [`risk_${reason}`, `riskInline_${reason}`])]) {
    assert.ok(catalog[key], key);
  }
  const options = fs.readFileSync(path.join(__dirname, "../options.html"), "utf8");
  for (const match of options.matchAll(/data-i18n="([A-Za-z0-9_]+)"/g)) {
    assert.ok(catalog[match[1]], `options.html: ${match[1]}`);
  }
});
