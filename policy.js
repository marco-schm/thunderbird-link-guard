"use strict";

(function (root) {
  // Public short-link services only. Branded mail click tracking uses arbitrary
  // hostnames and is intentionally handled by the user's normal host decision.
  const SHORTENER_HOSTS = [
    "bit.ly", "bitly.is", "bitly.com", "j.mp", "tinyurl.com", "t.co",
    "lnkd.in", "buff.ly", "ow.ly", "rb.gy", "rebrand.ly", "s.gy", "short.gy",
    "is.gd", "v.gd", "tiny.cc", "cutt.ly", "bl.ink"
  ];
  // These hosts let users publish their own pages or documents. A broad
  // approval of the provider's parent domain must not approve them.
  const SHARED_CONTENT_HOSTS = [
    "docs.google.com", "drive.google.com", "sites.google.com", "forms.gle",
    "onedrive.live.com", "sharepoint.com", "gist.github.com",
    "github.io", "gitlab.io", "pages.dev", "workers.dev", "vercel.app",
    "netlify.app", "web.app", "firebaseapp.com", "appspot.com"
  ];
  const MAX_URL_LENGTH = 8192;
  const MAX_HOSTS = 500;

  function canonicalHost(host) {
    return host.toLowerCase().replace(/\.$/, "");
  }

  function isIpAddress(host) {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
  }

  function normalizeHost(input) {
    if (typeof input !== "string") throw new Error("invalidHost");
    const value = input.trim();
    if (!value || value.length > 253 || /[\s\/@:?#*%\\]/.test(value)) {
      throw new Error("invalidHost");
    }
    const parsed = new URL(`https://${value}/`);
    const host = canonicalHost(parsed.hostname);
    const labels = host.split(".");
    if (isIpAddress(host) || labels.length < 2 || labels.some(label =>
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
      throw new Error("invalidHost");
    }
    return host;
  }

  function parseHostList(text) {
    const hosts = new Set();
    const errors = [];
    const lines = String(text).split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const entry = lines[index].trim();
      if (!entry) continue;
      try { hosts.add(normalizeHost(entry)); }
      catch { errors.push(index + 1); }
      if (hosts.size > MAX_HOSTS) {
        errors.push("limit");
        break;
      }
    }
    return { hosts: [...hosts].sort(), errors };
  }

  // The only wildcard accepted in editable rules denotes a whole registrable
  // domain, including its apex. Imported lists remain exact-host-only.
  function parseRuleList(text, wholeDomainOnly = false) {
    const hosts = new Set();
    const domains = new Set();
    const errors = [];
    const lines = String(text).split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const entry = lines[index].trim();
      if (!entry) continue;
      try {
        if (entry.startsWith("*.")) domains.add(normalizeHost(entry.slice(2)));
        else if (!wholeDomainOnly) hosts.add(normalizeHost(entry));
        else throw new Error("wildcard required");
      } catch { errors.push(index + 1); }
      if (hosts.size + domains.size > MAX_HOSTS) {
        errors.push("limit");
        break;
      }
    }
    return { hosts: [...hosts].sort(), domains: [...domains].sort(), errors };
  }

  function oneEditOrSwap(a, b) {
    if (a === b || Math.abs(a.length - b.length) > 1) return false;
    let left = 0;
    let right = 0;
    let edits = 0;
    while (left < a.length && right < b.length) {
      if (a[left] === b[right]) { left++; right++; continue; }
      if (++edits > 1) return false;
      if (a.length === b.length && left + 1 < a.length &&
          a[left] === b[right + 1] && a[left + 1] === b[right]) {
        left += 2;
        right += 2;
      } else if (a.length > b.length) left++;
      else if (b.length > a.length) right++;
      else { left++; right++; }
    }
    return edits + (left < a.length || right < b.length ? 1 : 0) === 1;
  }

  function lookalikeDomain(candidate, trustedDomains) {
    if (!candidate || !Array.isArray(trustedDomains)) return null;
    const labels = candidate.split(".");
    if (labels.length < 2 || labels[0].length < 4) return null;
    for (const trusted of trustedDomains.slice(0, 10000)) {
      if (trusted === candidate) continue;
      if (oneEditOrSwap(candidate, trusted)) return trusted;
      const other = trusted.split(".");
      if (other.length !== labels.length || other[0].length < 4 ||
          labels.slice(1).join(".") !== other.slice(1).join(".")) continue;
      if (oneEditOrSwap(labels[0], other[0])) return trusted;
    }
    return null;
  }

  function isInternationalizedHost(host) {
    return typeof host === "string" && host.split(".").some(label => label.startsWith("xn--"));
  }

  function apparentHost(text) {
    if (typeof text !== "string") return null;
    const visible = text.trim().replace(/[\s\u00a0]+/g, " ");
    const match = visible.match(/(?:https?:\/\/|www\.)[^\s<>"']+/i);
    if (!match || match[0].length > 253) return null;
    const candidate = match[0].replace(/[),.;!?]+$/, "");
    try {
      const url = new URL(/^www\./i.test(candidate) ? `https://${candidate}` : candidate);
      return canonicalHost(url.hostname);
    } catch { return null; }
  }

  function matchesHost(host, domains) {
    return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
  }

  function hostServiceRisk(host) {
    if (matchesHost(host, SHORTENER_HOSTS)) return "shortLink";
    return null;
  }

  function isSharedContentHost(host) {
    return matchesHost(host, SHARED_CONTENT_HOSTS);
  }

  function inspectLink(href, visibleText = "") {
    if (typeof href !== "string" || href.length > MAX_URL_LENGTH) {
      return { kind: "blocked", host: "", hosts: [], reason: "invalidUrl" };
    }
    const value = href.trim();
    if (!value || value.startsWith("#") || /^(?:mailto|tel|cid):/i.test(value)) {
      return { kind: "skip", host: "", hosts: [], reason: "" };
    }
    let url;
    try { url = new URL(value); }
    catch { return { kind: "blocked", host: "", hosts: [], reason: "invalidUrl" }; }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { kind: "blocked", host: "", hosts: [], reason: "badScheme" };
    }
    const host = canonicalHost(url.hostname);
    const risks = [];
    const displayed = apparentHost(visibleText);
    if (displayed && displayed !== host) risks.push("textMismatch");
    if (url.username || url.password) risks.push("credentials");
    if (isIpAddress(host)) risks.push("ipAddress");
    if (url.port) risks.push("unusualPort");
    if (hostServiceRisk(host)) risks.push("shortLink");
    const result = { kind: "web", host, hosts: [host], reason: "" };
    if (risks.length) result.risks = risks;
    return result;
  }

  const api = Object.freeze({ canonicalHost, isIpAddress, normalizeHost, parseHostList, parseRuleList, inspectLink,
    lookalikeDomain, isInternationalizedHost, hostServiceRisk, isSharedContentHost,
    apparentHost });
  root.LinkGuardPolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
