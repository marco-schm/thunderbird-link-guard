const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = language => JSON.parse(fs.readFileSync(
  path.join(__dirname, `../_locales/${language}/messages.json`), "utf8"));
const locales = ["de", "en", "es", "fr", "it", "ja", "pl", "pt_BR", "ru", "zh_CN"];
const { effectiveUiLocale } = require("../locale.js");

test("unsupported Thunderbird UI locales fall back to English", () => {
  assert.equal(effectiveUiLocale("nl-NL"), "en");
  assert.equal(effectiveUiLocale("tr-TR"), "en");
  assert.equal(effectiveUiLocale(""), "en");
  assert.equal(effectiveUiLocale("es-MX"), "es");
  assert.equal(effectiveUiLocale("de-DE"), "de");
  assert.equal(effectiveUiLocale("pt-BR"), "pt-BR");
  assert.equal(effectiveUiLocale("zh-CN"), "zh-CN");
});

test("English fallback ignores a supported secondary Thunderbird language", () => {
  const context = vm.createContext({ messenger: { i18n: {
    getUILanguage: () => "nl",
    getMessage: () => "Spanish secondary language"
  } } });
  for (const file of ["english.js", "locale.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  assert.equal(context.LinkGuardLocale.getMessage("settingsTitle"), "Link Guard settings");
  assert.equal(context.LinkGuardLocale.getMessage("toolbarPending", ["3"]),
    "Link Guard: 3 blocked links");
  assert.equal(context.LinkGuardLocale.getMessage("panelCompactRisk", ["2", "1"]),
    "⚠ Warnings: 1 · Pending: 2");
  assert.equal(context.LinkGuardLocale.effectiveUiLocale("nl"), "en");
  assert.deepEqual(JSON.parse(JSON.stringify(context.LinkGuardEnglish)), read("en"));
});

test("ten locale catalogs have complete keys and unchanged substitutions", () => {
  const en = read("en");
  const actual = fs.readdirSync(path.join(__dirname, "../_locales"))
    .filter(name => fs.existsSync(path.join(__dirname, "../_locales", name, "messages.json")));
  assert.deepEqual(actual.sort(), [...locales].sort());
  assert.equal(require("../manifest.json").default_locale, "en");
  for (const locale of locales) {
    const catalog = read(locale);
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(en).sort(), locale);
    for (const [key, entry] of Object.entries(en)) {
      const translated = catalog[key];
      assert.ok(translated.message?.trim(), `${locale}: ${key}`);
      assert.deepEqual(translated.placeholders, entry.placeholders, `${locale}: ${key} placeholders`);
      const tokens = message => [...message.matchAll(/\$[A-Z][A-Z0-9_]*\$/g)].map(match => match[0]).sort();
      assert.deepEqual(tokens(translated.message), tokens(entry.message), `${locale}: ${key} tokens`);
    }
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
