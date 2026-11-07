"use strict";

(function (root) {
  const policy = root.LinkGuardPolicy || require("./policy.js");
  const MAX_BYTES = 65536;
  const MAX_LISTS = 20;
  const categories = new Set(["news", "social", "companies", "other"]);

  function exactKeys(value, keys) {
    return value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).sort().join("|") === [...keys].sort().join("|");
  }

  function parse(text) {
    if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_BYTES) {
      throw new Error("importTooLarge");
    }
    let raw;
    try { raw = JSON.parse(text); }
    catch { throw new Error("importFormat"); }
    if (!exactKeys(raw, ["format", "version", "name", "category", "hosts"]) ||
        raw.format !== "link-guard-hosts" || raw.version !== 1 ||
        typeof raw.name !== "string" || !/^[^\x00-\x1f\x7f<>\u2028\u2029\u202a-\u202e\u2066-\u2069]{1,60}$/.test(raw.name.trim()) ||
        !categories.has(raw.category) || !Array.isArray(raw.hosts) ||
        raw.hosts.length < 1 || raw.hosts.length > 500) {
      throw new Error("importFormat");
    }
    const hosts = new Set();
    for (const value of raw.hosts) {
      let host;
      try { host = policy.normalizeHost(value); }
      catch { throw new Error("importFormat"); }
      if (hosts.has(host)) throw new Error("importDuplicate");
      hosts.add(host);
    }
    return { name: raw.name.trim(), category: raw.category, hosts: [...hosts].sort() };
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
      return { ...parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), sourceUrl: url };
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
          name: item.name, category: item.category, hosts: item.hosts }));
        const sourceUrl = item.sourceUrl ? parseRemoteUrl(item.sourceUrl) : "";
        lists.push({ id: item.id, ...parsed, sourceUrl, enabled: item.enabled === true });
        seen.add(item.id);
      } catch { /* Corrupt stored lists cannot grant access. */ }
    }
    return lists;
  }

  const api = Object.freeze({ parse, parseRemoteUrl, fetchRemote, cleanStored, MAX_BYTES, MAX_LISTS });
  root.LinkGuardImport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
