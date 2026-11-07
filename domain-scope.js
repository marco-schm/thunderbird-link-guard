"use strict";

(function (root) {
  function canonical(rule) {
    try { return new URL(`https://${rule}/`).hostname.toLowerCase().replace(/\.$/, ""); }
    catch { return ""; }
  }

  function parsePublicSuffixList(text) {
    const exact = new Set();
    const wildcard = new Set();
    const exception = new Set();
    for (const line of String(text).split(/\r?\n/)) {
      const rule = line.trim();
      if (!rule || rule.startsWith("//")) continue;
      const target = rule.startsWith("!") ? exception :
        rule.startsWith("*.") ? wildcard : exact;
      const normalized = canonical(rule.replace(/^!|^\*\./, ""));
      if (normalized) target.add(normalized);
    }
    return { exact, wildcard, exception };
  }

  function registrableDomain(host, rules) {
    if (typeof host !== "string" || !rules) return null;
    const labels = host.toLowerCase().replace(/\.$/, "").split(".");
    if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
      return null;
    }
    let suffixLabels = 0;
    let exceptionLabels = 0;
    for (let index = 0; index < labels.length; index++) {
      const candidate = labels.slice(index).join(".");
      const length = labels.length - index;
      if (rules.exception.has(candidate)) exceptionLabels = Math.max(exceptionLabels, length);
      if (rules.exact.has(candidate)) suffixLabels = Math.max(suffixLabels, length);
      if (index > 0 && rules.wildcard.has(candidate)) {
        suffixLabels = Math.max(suffixLabels, length + 1);
      }
    }
    if (exceptionLabels) suffixLabels = exceptionLabels - 1;
    if (!suffixLabels || labels.length <= suffixLabels) return null;
    return labels.slice(-(suffixLabels + 1)).join(".");
  }

  const api = Object.freeze({ parsePublicSuffixList, registrableDomain });
  root.LinkGuardDomainScope = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
