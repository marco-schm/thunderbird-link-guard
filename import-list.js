"use strict";

(function (root) {
  const policy = root.LinkGuardPolicy || require("./policy.js");
  const MAX_BYTES = 65536;
  const MAX_LISTS = 20;
  const categories = new Set(["news", "social", "companies", "other"]);
  const kinds = new Set(["allow", "block"]);
  const refreshStatuses = new Set(["ok", "failed", "kindChanged", "review"]);
  const MAX_AUTO_ADDED = 50;
  const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const REFRESH_RETRY_MS = 60 * 60 * 1000;

  // `kind` is optional so that lists written before block lists existed stay valid.
  function hasKeys(value, required, optional = []) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return required.every(key => keys.includes(key)) &&
      keys.every(key => required.includes(key) || optional.includes(key));
  }

  // Allow lists hold exact hosts only. Block lists may also hold `*.example.org`,
  // which blocks the registrable domain and its subdomains. Blocking can only
  // remove access, so the wider syntax is safe there. Whether a wildcard names a
  // registrable domain is checked against the Public Suffix List by the background.
  function normalizeEntry(value, kind) {
    if (kind === "block" && typeof value === "string" && value.startsWith("*.")) {
      return `*.${policy.normalizeHost(value.slice(2))}`;
    }
    return policy.normalizeHost(value);
  }

  function parse(text) {
    if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_BYTES) {
      throw new Error("importTooLarge");
    }
    let raw;
    try { raw = JSON.parse(text); }
    catch { throw new Error("importFormat"); }
    if (!hasKeys(raw, ["format", "version", "name", "category", "hosts"], ["kind"]) ||
        raw.format !== "link-guard-hosts" || raw.version !== 1 ||
        (raw.kind !== undefined && !kinds.has(raw.kind)) ||
        typeof raw.name !== "string" || !/^[^\x00-\x1f\x7f<>\u2028\u2029\u202a-\u202e\u2066-\u2069]{1,60}$/.test(raw.name.trim()) ||
        !categories.has(raw.category) || !Array.isArray(raw.hosts) ||
        raw.hosts.length < 1 || raw.hosts.length > 500) {
      throw new Error("importFormat");
    }
    const kind = raw.kind || "allow";
    const hosts = new Set();
    for (const value of raw.hosts) {
      let host;
      try { host = normalizeEntry(value, kind); }
      catch { throw new Error("importFormat"); }
      if (hosts.has(host)) throw new Error("importDuplicate");
      hosts.add(host);
    }
    return { name: raw.name.trim(), category: raw.category, kind, hosts: [...hosts].sort() };
  }

  function parseRemoteUrl(input) {
    if (typeof input !== "string" || input.length > 2048) throw new Error("importUrl");
    let url;
    try { url = new URL(input); }
    catch { throw new Error("importUrl"); }
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.search || url.hash || url.pathname.endsWith("/") ||
        !/^\/[a-zA-Z0-9._~!$&'()+,;=:@%/-]+$/.test(url.pathname)) {
      throw new Error("importUrl");
    }
    try { policy.normalizeHost(url.hostname); }
    catch { throw new Error("importUrl"); }
    return url.href;
  }

  async function fetchRemote(input, fetcher = fetch) {
    const { text, sourceUrl } = await fetchText(input, fetcher);
    return { ...parse(text), sourceUrl };
  }

  // Shared by host lists and warning lists: HTTPS only, CORS, no credentials, no
  // redirects, bounded in time and bytes, strict UTF-8.
  async function fetchText(input, fetcher = fetch) {
    const url = parseRemoteUrl(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetcher(url, { method: "GET", mode: "cors", credentials: "omit",
        cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
        signal: controller.signal });
      if (!response.ok || response.url !== url ||
          !/^(?:application\/json|text\/plain)(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) {
        throw new Error("importFetch");
      }
      const declared = Number(response.headers.get("content-length"));
      if (declared > MAX_BYTES) throw new Error("importTooLarge");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("importFetch");
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error("importTooLarge"); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), sourceUrl: url };
    } finally { clearTimeout(timer); }
  }

  function cleanStored(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const lists = [];
    for (const item of value.slice(0, MAX_LISTS)) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" ||
          !/^[a-f0-9-]{36}$/.test(item.id) || seen.has(item.id)) continue;
      try {
        const parsed = parse(JSON.stringify({ format: "link-guard-hosts", version: 1,
          name: item.name, category: item.category, kind: item.kind, hosts: item.hosts }));
        const sourceUrl = item.sourceUrl ? parseRemoteUrl(item.sourceUrl) : "";
        // Only a remote blocklist may update itself: an automatic update can narrow
        // access but must never grant it. It is on unless the user switched it off.
        const autoRefresh = (item.autoRefresh === undefined || item.autoRefresh === true) &&
          parsed.kind === "block" && Boolean(sourceUrl);
        lists.push({ id: item.id, ...parsed, sourceUrl, enabled: item.enabled === true,
          autoRefresh,
          refreshedAt: Number.isSafeInteger(item.refreshedAt) && item.refreshedAt > 0 ? item.refreshedAt : 0,
          refreshStatus: refreshStatuses.has(item.refreshStatus) ? item.refreshStatus : "" });
        seen.add(item.id);
      } catch { /* Corrupt stored lists cannot grant access. */ }
    }
    return lists;
  }

  function autoRefreshDue(list, now) {
    if (!list.autoRefresh || !list.enabled || list.kind !== "block" || !list.sourceUrl) return false;
    const wait = list.refreshStatus === "failed" ? REFRESH_RETRY_MS : REFRESH_INTERVAL_MS;
    return !(now >= list.refreshedAt) || now - list.refreshedAt >= wait;
  }

  const inside = (host, domain) => host === domain || host.endsWith(`.${domain}`);

  // Would blocking this entry block something the user has personally approved?
  function blocksApproval(entry, approvedHosts, approvedDomains) {
    if (entry.startsWith("*.")) {
      const domain = entry.slice(2);
      return approvedHosts.some(host => inside(host, domain)) ||
        approvedDomains.some(root => inside(root, domain) || inside(domain, root));
    }
    return approvedHosts.includes(entry) || approvedDomains.some(root => inside(entry, root));
  }

  // An automatic blocklist update is applied only if it is small and does not block
  // anything the user approved. Otherwise it needs a manual review ("review").
  // Returns "ok" or "review".
  function assessAutoUpdate(oldHosts, newHosts, approvedHosts, approvedDomains) {
    const before = new Set(oldHosts);
    const added = newHosts.filter(entry => !before.has(entry));
    if (added.length > MAX_AUTO_ADDED || newHosts.length > Math.max(oldHosts.length * 2, 25) ||
        (oldHosts.length >= 10 && newHosts.length < oldHosts.length / 2)) return "review";
    return added.some(entry => blocksApproval(entry, approvedHosts, approvedDomains)) ? "review" : "ok";
  }

  const api = Object.freeze({ parse, parseRemoteUrl, fetchRemote, fetchText, cleanStored, autoRefreshDue, assessAutoUpdate, MAX_BYTES, MAX_LISTS,
    MAX_HOSTS: 500 });
  root.LinkGuardImport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
