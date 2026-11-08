"use strict";

(function (root) {
  const baseLocales = new Set(["cs", "da", "de", "en", "es", "fi", "fr", "hu", "it", "ja", "ko",
    "nl", "pl", "ru", "sv", "tr", "uk"]);

  function effectiveUiLocale(uiLanguage) {
    const locale = String(uiLanguage || "").replaceAll("_", "-").toLowerCase();
    if (locale === "pt-br") return "pt-BR";
    if (locale === "zh-cn") return "zh-CN";
    if (locale === "zh-tw") return "zh-TW";
    const base = locale.split("-")[0];
    return baseLocales.has(base) ? base : "en";
  }

  function getMessage(key, values) {
    const locale = effectiveUiLocale(messenger.i18n.getUILanguage());
    if (locale !== "en") return messenger.i18n.getMessage(key, values) || key;
    const entry = root.LinkGuardEnglish?.[key];
    if (!entry) return key;
    const substitutions = values === undefined ? [] : Array.isArray(values) ? values : [values];
    return entry.message.replace(/\$([A-Za-z][A-Za-z0-9_]*)\$/g, (match, name) => {
      const placeholder = entry.placeholders?.[name.toLowerCase()];
      if (!placeholder) return match;
      const index = /^\$(\d+)$/.exec(placeholder.content)?.[1];
      return index ? String(substitutions[Number(index) - 1] ?? "") : match;
    });
  }

  root.LinkGuardLocale = { effectiveUiLocale, getMessage };
  if (typeof module !== "undefined") module.exports = root.LinkGuardLocale;
})(globalThis);
