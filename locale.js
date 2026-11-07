"use strict";

(function (root) {
  const baseLocales = new Set(["de", "en", "es", "fr", "it", "ja", "pl", "ru"]);

  function effectiveUiLocale(uiLanguage) {
    const locale = String(uiLanguage || "").replaceAll("_", "-").toLowerCase();
    if (locale === "pt-br") return "pt-BR";
    if (locale === "zh-cn") return "zh-CN";
    const base = locale.split("-")[0];
    return baseLocales.has(base) ? base : "en";
  }

  root.LinkGuardLocale = { effectiveUiLocale };
  if (typeof module !== "undefined") module.exports = root.LinkGuardLocale;
})(globalThis);
