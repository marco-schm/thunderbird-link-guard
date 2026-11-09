"use strict";

(function (root) {
  const policy = root.LinkGuardPolicy || (typeof require !== "undefined" ? require("./policy.js") : null);

  // Approvals and blocks can hold tens of thousands of hosts (20 imported lists of 5,000),
  // and every link is checked several times per scan. Each list array therefore gets its
  // Set once, and a whole-domain rule is found by walking up the host's labels, so a
  // check costs a few Set lookups whatever the list sizes. The Sets are keyed by the
  // arrays themselves: a state that gets a new array gets a new Set.
  const sets = new WeakMap();
  const EMPTY = new Set();

  function setOf(list) {
    if (!Array.isArray(list)) return EMPTY;
    let set = sets.get(list);
    if (!set) {
      set = new Set(list);
      sets.set(list, set);
    }
    return set;
  }

  // The host itself or the nearest parent domain contained in `domains`, or "".
  function coveringDomain(domains, host) {
    if (!domains.size) return "";
    for (let rest = host; ;) {
      if (domains.has(rest)) return rest;
      const dot = rest.indexOf(".");
      if (dot < 0) return "";
      rest = rest.slice(dot + 1);
    }
  }

  // A block always wins, also over an approval for the current message: a blocked host
  // is opened only after it has been unblocked.
  function isBlocked(host, state) {
    return setOf(state.blockedHosts).has(host) || Boolean(coveringDomain(setOf(state.blockedDomains), host));
  }

  function isExactlyApproved(host, state) {
    return setOf(state.customAllowedHosts).has(host);
  }

  function isListApproved(host, state) {
    return setOf(state.allowedHosts).has(host);
  }

  function isBroadlyApproved(host, state) {
    return !policy.isSharedContentHost(host) &&
      Boolean(coveringDomain(setOf(state.broadAllowedDomains), host));
  }

  // The user's own block that covers a host: a whole-domain block first, since removing
  // only an exact block would leave the host blocked. null when only a list blocks it.
  function ownBlockFor(host, state) {
    const domain = coveringDomain(setOf(state.ownBlockedDomains), host);
    if (domain) return { scope: "domain", name: domain };
    return setOf(state.ownBlockedHosts).has(host) ? { scope: "exact", name: host } : null;
  }

  function hostAllowed(host, state, temporaryHosts, warningFor) {
    if (isBlocked(host, state)) return false;
    if (temporaryHosts.has(host)) return true;
    if (isExactlyApproved(host, state)) return true;
    const warning = warningFor(host);
    if (!warning || warning.kind !== "none") return false;
    return isListApproved(host, state) || isBroadlyApproved(host, state);
  }

  // A short link hides its destination; code in a link targets the very site it leads
  // to, typically one the user trusts. Neither may open on a lasting approval: only an
  // approval for the current message counts.
  const MESSAGE_ONLY_RISKS = ["shortLink", "scriptInUrl"];

  function linkAllowed(inspection, state, temporaryHosts, warningFor, stateReady) {
    if (!stateReady || inspection.kind !== "web") return false;
    if (inspection.hosts.some(host => isBlocked(host, state))) return false;
    if (inspection.risks?.some(risk => MESSAGE_ONLY_RISKS.includes(risk))) {
      return inspection.hosts.every(host => temporaryHosts.has(host));
    }
    if (inspection.risks?.length && !inspection.hosts.every(host =>
      temporaryHosts.has(host) || isExactlyApproved(host, state))) return false;
    return inspection.hosts.every(host =>
      hostAllowed(host, state, temporaryHosts, warningFor));
  }

  const api = Object.freeze({ linkAllowed, isBlocked, isExactlyApproved, isListApproved,
    isBroadlyApproved, ownBlockFor });
  root.LinkGuardAccess = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
