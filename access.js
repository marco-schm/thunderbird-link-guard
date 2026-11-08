"use strict";

(function (root) {
  const policy = root.LinkGuardPolicy || (typeof require !== "undefined" ? require("./policy.js") : null);
  function hostAllowed(host, state, temporaryHosts, warningFor) {
    if (temporaryHosts.has(host)) return true;
    if (state.blockedDomains?.some(domain => host === domain || host.endsWith(`.${domain}`))) return false;
    if (state.blockedHosts.includes(host)) return false;
    if (state.customAllowedHosts.includes(host)) return true;
    const warning = warningFor(host);
    if (!warning || warning.kind !== "none") return false;
    if (state.allowedHosts.includes(host)) return true;
    return !policy.isSharedContentHost(host) && state.broadAllowedDomains.some(domain =>
      host === domain || host.endsWith(`.${domain}`));
  }

  // A short link hides its destination; code in a link targets the very site it leads
  // to, typically one the user trusts. Neither may open on a lasting approval: only an
  // approval for the current message counts.
  const MESSAGE_ONLY_RISKS = ["shortLink", "scriptInUrl"];

  function linkAllowed(inspection, state, temporaryHosts, warningFor, stateReady) {
    if (!stateReady || inspection.kind !== "web") return false;
    if (inspection.risks?.some(risk => MESSAGE_ONLY_RISKS.includes(risk))) {
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
