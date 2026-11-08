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

  // A hostname written in visible text without a scheme or "www.", such as
  // "sparkasse.de". Whether it is a real domain (and not "datei.pdf") is decided by the
  // background against the Public Suffix List. Addresses like "info@example.org" are
  // not claims about a link destination and are ignored.
  const BARE_HOST = /(?<![\p{L}\p{N}@._-])((?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}]{2,63})(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])/u;

  function bareHostCandidate(text) {
    if (typeof text !== "string") return null;
    const visible = text.trim().replace(/[\s ]+/g, " ");
    const match = visible.match(BARE_HOST);
    if (!match || match[1].length > 253) return null;
    try { return canonicalHost(new URL(`https://${match[1]}/`).hostname); }
    catch { return null; }
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

  // Thunderbird resolves a clicked link against the document's base URI, and a message
  // can repoint that with `<base href>`. Returns the URL a click would actually open,
  // or null when the target cannot be resolved.
  function resolveHref(href, baseUrl = "") {
    if (typeof href !== "string") return null;
    try { return new URL(href.trim(), baseUrl || undefined); }
    catch { return null; }
  }

  // ----- Code and embedded destinations inside a URL ------------------------------
  // Both checks read the path, query and fragment after undoing the encodings that are
  // stacked to get past filters (OWASP XSS filter evasion cheat sheet): percent-encoding
  // up to three times, HTML character references, JavaScript escapes, and control
  // characters inside words such as `java\tscript:`. All patterns are free of nested
  // quantifiers, so their running time stays linear in the length of the URL.
  const DECODE_PASSES = 3;
  const MAX_DESTINATIONS = 5;

  function percentDecode(text) {
    try { return decodeURIComponent(text); }
    catch { return text.replace(/%([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))); }
  }

  // The percent-decoding chain of a text: the text itself and each further decoding.
  function percentForms(text, plusIsSpace = false) {
    const forms = [];
    let current = text;
    for (let pass = 0; pass <= DECODE_PASSES; pass++) {
      forms.push(current);
      const next = percentDecode(plusIsSpace ? current.replace(/\+/g, " ") : current);
      if (next === current) break;
      current = next;
    }
    return forms;
  }

  const NAMED_REFERENCES = { lt: "<", gt: ">", quot: "\"", apos: "'", amp: "&", colon: ":",
    tab: "\t", newline: "\n", sol: "/", lpar: "(", rpar: ")", equals: "=", semi: ";", grave: "`" };

  function codePoint(value, fallback) {
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : fallback;
  }

  function decodeReferences(text) {
    return text
      .replace(/&#x0*([0-9a-f]{1,6});?/gi, (match, hex) => codePoint(parseInt(hex, 16), match))
      .replace(/&#0*([0-9]{1,7});?/g, (match, dec) => codePoint(parseInt(dec, 10), match))
      .replace(/&([a-z]{2,7});/gi, (match, name) => NAMED_REFERENCES[name.toLowerCase()] ?? match)
      .replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi,
        (match, braced, four, two) => codePoint(parseInt(braced || four || two, 16), match));
  }

  function decodedForms(text) {
    const forms = new Set();
    for (const form of percentForms(text, true)) {
      forms.add(form);
      const referenced = decodeReferences(form);
      forms.add(referenced);
      forms.add(referenced.replace(/[\x00-\x1f\x7f]+/g, ""));
    }
    return [...forms].map(form => form.toLowerCase());
  }

  // Tags that can run script or load content when reflected into a page.
  const DANGEROUS_TAGS = "script|img|image|svg|iframe|frame|frameset|object|embed|applet|body|html|" +
    "style|link|meta|base|form|input|button|textarea|select|option|details|dialog|video|audio|" +
    "source|track|math|marquee|isindex|template|animate|set|xmp|plaintext|noscript|title|" +
    "bgsound|keygen|a";
  // Event handler attributes, only where an attribute can start: an `&onload=` query
  // parameter is ordinary, `" onload=` or `/onload=` after a tag is not.
  const EVENT_HANDLERS = "abort|activate|afterprint|animation(?:cancel|end|iteration|start)|" +
    "auxclick|before(?:copy|cut|input|paste|print|toggle|unload)|begin|blur|cancel|" +
    "canplay(?:through)?|change|click|close|contextmenu|copy|cuechange|cut|dblclick|" +
    "drag(?:end|enter|leave|over|start)?|drop|durationchange|emptied|end|ended|error|" +
    "focus(?:in|out)?|formdata|fullscreenchange|hashchange|input|invalid|key(?:down|press|up)|" +
    "load(?:eddata|edmetadata|start|end)?|message|mouse(?:down|enter|leave|move|out|over|up|wheel)|" +
    "offline|online|page(?:hide|show)|paste|pause|play(?:ing)?|" +
    "pointer(?:cancel|down|enter|leave|move|out|over|rawupdate|up)|popstate|progress|ratechange|" +
    "readystatechange|repeat|reset|resize|scroll(?:end)?|search|seek(?:ed|ing)|" +
    "select(?:ionchange|start)?|show|stalled|start|storage|submit|suspend|timeupdate|toggle|" +
    "touch(?:cancel|end|move|start)|transition(?:cancel|end|run|start)|unhandledrejection|" +
    "unload|volumechange|waiting|webkit[a-z]{0,30}|wheel";
  const SCRIPT_SIGNS = [
    new RegExp(`<\\s*/?\\s*(?:${DANGEROUS_TAGS})(?=[\\s/>]|$)`),
    /<!--|<!\[cdata\[/,
    new RegExp(`(?:^|[\\s"'\`/;>(])on(?:${EVENT_HANDLERS})\\s*=`),
    /(?:java|vb|live)script\s*:/,
    /data\s*:\s*(?:text\/html|image\/svg\+xml|(?:text|application)\/(?:x-)?(?:java|ecma)script)/,
    /document\s*\.\s*(?:cookie|domain|write|location)|window\s*\.\s*(?:location|open)\b|location\s*\.\s*(?:href|replace|assign)\b/,
    /(?:^|[^a-z0-9_$])(?:alert|prompt|confirm|eval|atob|settimeout|setinterval|fromcharcode)[(`]/,
    /(?:^|[\s"'/])srcdoc\s*=/
  ];

  // Script or HTML code in the path, query or fragment: the shape of a reflected XSS
  // payload aimed at the linked site.
  function scriptInUrl(url) {
    const tail = `${url.pathname}${url.search}${url.hash}`;
    if (tail.length <= 1) return false;
    return decodedForms(tail).some(form => SCRIPT_SIGNS.some(sign => sign.test(form)));
  }

  // Parameters whose name says they carry a destination. Only these may name one
  // without a scheme (`//evil.example`); any parameter may carry a full URL.
  const DESTINATION_NAMES = /^(?:u|url|uri|link|href|r|rurl|q|to|go|goto|next|out|jump|view|continue|forward|relaystate|dest[a-z_]*|target[a-z_]*|redir[a-z_]*|redirect[a-z_]*|return[a-z_]*|callback[a-z_]*|success[a-z_]*|landing[a-z_]*)$/i;
  const ABSOLUTE_URL = /https?:[\\/]{1,3}[^\s"'<>`]+/gi;
  const BASE64_URL = /^aHR0c[A-Za-z0-9+/_-]{6,}={0,2}$/;

  function hostOf(candidate) {
    try {
      const url = new URL(candidate.replace(/\\/g, "/"));
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return url.hostname ? canonicalHost(url.hostname) : "";
    } catch { return ""; }
  }

  function base64Text(value) {
    try {
      const text = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
      return /^[\x20-\x7e]+$/.test(text) ? text : "";
    } catch { return ""; }
  }

  // Destination hosts carried inside a URL: full URLs anywhere in the path, query or
  // fragment; scheme-relative ones in destination parameters; base64-encoded URLs; and
  // the formats of Microsoft Safe Links (url=) and Proofpoint URL Defense (v2 u=, v3 __…__).
  function embeddedDestinations(url) {
    const hosts = new Set();
    const addFrom = text => {
      for (const match of text.matchAll(ABSOLUTE_URL)) {
        const host = hostOf(match[0]);
        if (host) hosts.add(host);
        if (hosts.size >= MAX_DESTINATIONS) return;
      }
    };
    const examine = (value, named) => {
      for (const form of percentForms(value)) {
        if (hosts.size >= MAX_DESTINATIONS) return;
        const trimmed = form.trim();
        if (/^https?-3a__/i.test(trimmed)) {
          addFrom(percentDecode(trimmed.replace(/_/g, "/").replace(/-/g, "%")));
        }
        if (BASE64_URL.test(trimmed)) addFrom(base64Text(trimmed));
        if (named && /^[\\/]{2}[^\\/]/.test(trimmed)) {
          const host = hostOf(`https:${trimmed}`);
          if (host) hosts.add(host);
        }
        addFrom(form);
      }
    };
    examine(url.pathname, false);
    for (const segment of url.pathname.split("/")) {
      if (BASE64_URL.test(segment)) addFrom(base64Text(segment));
    }
    const parameters = [...url.searchParams];
    const fragment = url.hash.slice(1);
    if (fragment.includes("=")) {
      try { parameters.push(...new URLSearchParams(fragment)); } catch { /* not parameters */ }
    } else if (fragment) examine(fragment, false);
    for (const [name, value] of parameters.slice(0, 100)) {
      if (hosts.size >= MAX_DESTINATIONS) break;
      examine(value, DESTINATION_NAMES.test(name));
    }
    return [...hosts].slice(0, MAX_DESTINATIONS);
  }

  function inspectLink(href, visibleText = "", baseUrl = "") {
    if (typeof href !== "string" || href.length > MAX_URL_LENGTH) {
      return { kind: "blocked", host: "", hosts: [], reason: "invalidUrl" };
    }
    const value = href.trim();
    if (/^(?:mailto|tel|cid):/i.test(value)) {
      return { kind: "skip", host: "", hosts: [], reason: "" };
    }
    const skip = { kind: "skip", host: "", hosts: [], reason: "" };
    // An empty href or a bare fragment is an in-message anchor only as long as it stays
    // inside the message. `<base href>` points both of them at the web, so the decision
    // is made on the resolved URL and never on the shape of the attribute.
    const inMessage = !value || value.startsWith("#");
    const url = resolveHref(value, baseUrl);
    if (!url) {
      return inMessage ? skip : { kind: "blocked", host: "", hosts: [], reason: "invalidUrl" };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return inMessage ? skip : { kind: "blocked", host: "", hosts: [], reason: "badScheme" };
    }
    if (url.href.length > MAX_URL_LENGTH) {
      return { kind: "blocked", host: "", hosts: [], reason: "invalidUrl" };
    }
    const host = canonicalHost(url.hostname);
    const risks = [];
    const displayed = apparentHost(visibleText);
    if (displayed && displayed !== host) risks.push("textMismatch");
    if (url.username || url.password) risks.push("credentials");
    if (isIpAddress(host)) risks.push("ipAddress");
    if (hostServiceRisk(host)) risks.push("shortLink");
    if (scriptInUrl(url)) risks.push("scriptInUrl");
    const result = { kind: "web", host, hosts: [host], reason: "" };
    if (risks.length) result.risks = risks;
    // Whether a destination deserves a warning depends on the user's approvals, so the
    // message page decides; the link's own host is never its own destination.
    const destinations = embeddedDestinations(url).filter(destination => destination !== host);
    if (destinations.length) result.destinations = destinations;
    return result;
  }

  const api = Object.freeze({ canonicalHost, isIpAddress, normalizeHost, parseHostList, parseRuleList, inspectLink,
    resolveHref, lookalikeDomain, isInternationalizedHost, hostServiceRisk, isSharedContentHost,
    apparentHost, bareHostCandidate, scriptInUrl, embeddedDestinations });
  root.LinkGuardPolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
