"use strict";

// Configurable warnings: switching built-in warnings off, the user's own regular
// expression rules, and imported warning lists.
//
// Warning rules can only add warnings. A link that matches a rule is treated like any
// other risky link: it stays inactive until the user approves its exact host, and the
// rule's label is shown next to it. Nothing here can approve a link. Patterns are
// compiled by safe-regex.js, whose matching time is linear, and every evaluation is
// charged to a budget. If the budget runs out the link gets a "customSkipped" warning
// instead of being let through unchecked.
(function (root) {
  const regex = root.LinkGuardRegex || require("./safe-regex.js");
  const BUILTIN = Object.freeze(["lookalike", "idn", "textMismatch", "credentials",
    "ipAddress", "shortLink", "scriptInUrl", "redirect"]);
  const TARGETS = Object.freeze(["host", "url", "text"]);
  const MAX_OWN_RULES = 50;
  const MAX_LISTS = 10;
  const MAX_LIST_RULES = 50;
  const MAX_TOTAL_RULES = 200;
  const MAX_BYTES = 65536;
  const CACHE_LIMIT = 2000;
  // Labels are shown in the warning panel. Control, bidirectional and zero-width
  // characters could disguise them, and angle brackets are refused out of caution.
  const LABEL = /^[^\x00-\x1f\x7f<>\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]{1,60}$/;
  const NAME = LABEL;
  const ID = /^[a-f0-9-]{36}$/;

  function hasKeys(value, required) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length === required.length && required.every(key => keys.includes(key));
  }

  function ruleError(code, index) {
    const error = new Error(code);
    if (index !== undefined) error.rule = index + 1;
    return error;
  }

  function cleanDisabled(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(item => BUILTIN.includes(item)))].sort();
  }

  // Throws "ruleFormat", "labelInvalid" or one of the safe-regex codes.
  function parseRule(raw) {
    if (!hasKeys(raw, ["label", "target", "pattern"])) throw new Error("ruleFormat");
    if (typeof raw.label !== "string" || !LABEL.test(raw.label.trim())) throw new Error("labelInvalid");
    if (!TARGETS.includes(raw.target)) throw new Error("ruleFormat");
    if (typeof raw.pattern !== "string") throw new Error("regexSyntax");
    regex.compile(raw.pattern);
    return { label: raw.label.trim(), target: raw.target, pattern: raw.pattern };
  }

  function parseRules(value, limit) {
    if (!Array.isArray(value) || value.length > limit) throw new Error("warningRuleLimit");
    return value.map((raw, index) => {
      try { return parseRule(raw); }
      catch (error) { throw ruleError(error.message, index); }
    });
  }

  // Stored data is re-validated on every read; invalid entries are dropped.
  function cleanRules(value, limit = MAX_OWN_RULES) {
    if (!Array.isArray(value)) return [];
    const rules = [];
    for (const raw of value.slice(0, limit)) {
      try { rules.push(parseRule(raw)); }
      catch { /* An invalid stored rule is ignored. */ }
    }
    return rules;
  }

  function parseList(text) {
    if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_BYTES) {
      throw new Error("importTooLarge");
    }
    let raw;
    try { raw = JSON.parse(text); }
    catch { throw new Error("warningListFormat"); }
    if (!hasKeys(raw, ["format", "version", "name", "rules"]) ||
        raw.format !== "link-guard-warnings" || raw.version !== 1 ||
        typeof raw.name !== "string" || !NAME.test(raw.name.trim()) ||
        !Array.isArray(raw.rules) || raw.rules.length < 1) {
      throw new Error("warningListFormat");
    }
    return { name: raw.name.trim(), rules: parseRules(raw.rules, MAX_LIST_RULES) };
  }

  async function fetchList(url, fetcher) {
    const listImport = root.LinkGuardImport || require("./import-list.js");
    const { text, sourceUrl } = await listImport.fetchText(url, fetcher);
    return { ...parseList(text), sourceUrl };
  }

  function cleanStoredLists(value) {
    if (!Array.isArray(value)) return [];
    const listImport = root.LinkGuardImport || require("./import-list.js");
    const seen = new Set();
    const lists = [];
    for (const item of value.slice(0, MAX_LISTS)) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" ||
          !ID.test(item.id) || seen.has(item.id)) continue;
      try {
        const parsed = parseList(JSON.stringify({ format: "link-guard-warnings", version: 1,
          name: item.name, rules: item.rules }));
        const sourceUrl = item.sourceUrl ? listImport.parseRemoteUrl(item.sourceUrl) : "";
        lists.push({ id: item.id, ...parsed, sourceUrl, enabled: item.enabled === true });
        seen.add(item.id);
      } catch { /* A corrupt stored list adds no rules. */ }
    }
    return lists;
  }

  // The rules that apply: the user's own first, then enabled lists, capped in total.
  function effectiveRules(ownRules, lists) {
    const own = ownRules.map(rule => ({ ...rule, source: "" }));
    const imported = lists.filter(list => list.enabled)
      .flatMap(list => list.rules.map(rule => ({ ...rule, source: list.name })));
    return [...own, ...imported].slice(0, MAX_TOTAL_RULES);
  }

  // The full URL is matched as written and, when it differs, percent-decoded, so that
  // `%77p-admin` cannot slip past a rule for `wp-admin`.
  function urlInputs(href) {
    let normalized = String(href);
    try { normalized = new URL(normalized.trim()).href; } catch { /* keep as written */ }
    let decoded = normalized;
    try { decoded = decodeURIComponent(normalized); } catch { /* malformed escapes */ }
    return decoded === normalized ? [normalized] : [normalized, decoded];
  }

  function createEvaluator(rules) {
    const compiled = [];
    for (const rule of Array.isArray(rules) ? rules.slice(0, MAX_TOTAL_RULES) : []) {
      try {
        compiled.push(Object.freeze({ label: String(rule.label), source: String(rule.source || ""),
          target: rule.target, program: regex.compile(rule.pattern) }));
      } catch { /* Invalid rules never reach message pages; ignore defensively. */ }
    }
    const cache = new Map();
    // Returns the indices of all rules that match. Throws "regexBudget" when the budget
    // is used up; nothing partial is cached in that case.
    function matching(inputs, budget) {
      const hits = [];
      for (const target of TARGETS) {
        const values = inputs[target] || [];
        const key = `${target}\u0000${values.join("\u0000")}`;
        let found = cache.get(key);
        if (!found) {
          found = [];
          compiled.forEach((rule, index) => {
            if (rule.target === target &&
                values.some(value => regex.test(rule.program, value, budget))) found.push(index);
          });
          if (cache.size >= CACHE_LIMIT) cache.clear();
          cache.set(key, found);
        }
        hits.push(...found);
      }
      return hits.sort((a, b) => a - b);
    }
    return Object.freeze({ rules: Object.freeze(compiled), matching });
  }

  // Applies the user's warning settings to a policy.inspectLink() result.
  function applyWarnings(inspection, { disabled, evaluator, href, text, budget }) {
    if (inspection.kind !== "web") return inspection;
    const risks = (inspection.risks || []).filter(risk => !disabled?.has(risk));
    if (evaluator?.rules.length) {
      try {
        const hits = evaluator.matching({ host: [inspection.host], url: urlInputs(href),
          text: [String(text || "")] }, budget);
        for (const index of hits) risks.push(`custom:${index}`);
      } catch { risks.push("customSkipped"); }
    }
    const result = { ...inspection };
    if (risks.length) result.risks = risks;
    else delete result.risks;
    return result;
  }

  const api = Object.freeze({ BUILTIN, TARGETS, MAX_OWN_RULES, MAX_LISTS, MAX_LIST_RULES,
    MAX_TOTAL_RULES, MAX_BYTES, cleanDisabled, parseRule, parseRules, cleanRules, parseList,
    fetchList, cleanStoredLists, effectiveRules, createEvaluator, applyWarnings });
  root.LinkGuardWarnings = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
