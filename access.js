"use strict";

(function (root) {
  const policy = root.LinkGuardPolicy || (typeof require !== "undefined" ? require("./policy.js") : null);
  function hostAllowed(host, state, temporaryHosts, warningFor) {
    if (temporaryHosts.has(host)) return true;
    if (state.blockedHosts.includes(host)) return false;
    if (state.customAllowedHosts.includes(host)) return true;
    const warning = warningFor(host);
    if (!warning || warning.kind !== "none") return false;
    if (state.allowedHosts.includes(host)) return true;
    return !policy.isSharedContentHost(host) && state.broadAllowedDomains.some(domain =>
      host === domain || host.endsWith(`.${domain}`));
  }

  function linkAllowed(inspection, state, temporaryHosts, warningFor, stateReady) {
    if (!stateReady || inspection.kind !== "web") return false;
    if (inspection.risks?.includes("shortLink")) {
      return inspection.hosts.every(host => temporaryHosts.has(host));
    }
    if (inspection.risks?.length && !inspection.hosts.every(host =>
      temporaryHosts.has(host) || state.customAllowedHosts.includes(host))) return false;
    return inspection.hosts.every(host =>
      hostAllowed(host, state, temporaryHosts, warningFor));
  }

  const api = Object.freeze({ linkAllowed });
  root.LinkGuardAccess = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
