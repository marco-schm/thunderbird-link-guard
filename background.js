"use strict";

const SCRIPT_ID = "link-guard-message-display";
const policy = globalThis.LinkGuardPolicy;
const listImport = globalThis.LinkGuardImport;
const domainScope = globalThis.LinkGuardDomainScope;
let updateQueue = Promise.resolve();
let rulesPromise;

function publicSuffixRules() {
  if (!rulesPromise) {
    rulesPromise = fetch(messenger.runtime.getURL("vendor/public_suffix_list.dat"))
      .then(response => {
        if (!response.ok) throw new Error("public suffix list unavailable");
        return response.text();
      }).then(domainScope.parsePublicSuffixList)
      .catch(error => { rulesPromise = null; throw error; });
  }
  return rulesPromise;
}

async function scopeRoot(host) {
  const normalized = policy.normalizeHost(host);
  return domainScope.registrableDomain(normalized, await publicSuffixRules());
}

async function cleanBroadDomains(value) {
  if (!Array.isArray(value)) return [];
  const roots = new Set();
  for (const entry of value.slice(0, 500)) {
    try {
      const normalized = policy.normalizeHost(entry);
      if (await scopeRoot(normalized) === normalized) roots.add(normalized);
    } catch { /* An invalid or unverified scope cannot grant access. */ }
  }
  return [...roots].sort();
}

function cleanHosts(value) {
  if (!Array.isArray(value)) return [];
  const hosts = new Set();
  for (const entry of value.slice(0, 500)) {
    try { hosts.add(policy.normalizeHost(entry)); }
    catch { /* Invalid stored values never become trusted. */ }
  }
  return [...hosts].sort();
}

async function readState() {
  const local = await messenger.storage.local.get({
    enabled: true, customAllowedHosts: [], blockedHosts: [],
    importedLists: [], broadAllowedDomains: []
  });
  const customAllowedHosts = cleanHosts(local.customAllowedHosts);
  const blockedHosts = cleanHosts(local.blockedHosts);
  const broadAllowedDomains = await cleanBroadDomains(local.broadAllowedDomains);
  const importedLists = listImport.cleanStored(local.importedLists);
  const effective = new Set(customAllowedHosts);
  for (const list of importedLists) {
    if (list.enabled) for (const host of list.hosts) effective.add(host);
  }
  for (const host of blockedHosts) effective.delete(host);
  const rules = await publicSuffixRules();
  const trustedDomains = new Set(broadAllowedDomains);
  for (const host of effective) {
    const root = domainScope.registrableDomain(host, rules);
    if (root) trustedDomains.add(root);
  }
  return { enabled: local.enabled !== false, customAllowedHosts, blockedHosts,
    importedLists, broadAllowedDomains,
    allowedHosts: [...effective], trustedDomains: [...trustedDomains] };
}

async function analyzeHosts(hosts) {
  if (!Array.isArray(hosts) || hosts.length > 500) throw new Error("host limit");
  const rules = await publicSuffixRules();
  const state = await readState();
  const result = {};
  for (const value of hosts) {
    const host = policy.normalizeHost(value);
    const root = domainScope.registrableDomain(host, rules);
    const similarTo = policy.lookalikeDomain(root || host, state.trustedDomains);
    result[host] = policy.isInternationalizedHost(host) ?
      { kind: "idn", similarTo: similarTo || "" } :
      similarTo ? { kind: "lookalike", similarTo } : { kind: "none", similarTo: "" };
  }
  return result;
}

async function invalidBroadDomain(hosts) {
  if (!Array.isArray(hosts) || hosts.length > 500) throw new Error("host limit");
  const rules = await publicSuffixRules();
  for (const value of hosts) {
    const host = policy.normalizeHost(value);
    if (domainScope.registrableDomain(host, rules) !== host) return host;
  }
  return null;
}

async function setDecision(host, decision, scope = "exact") {
  const normalized = policy.normalizeHost(host);
  if (!["permanent", "block", "clear"].includes(decision)) {
    throw new Error("invalid decision");
  }
  const state = await readState();
  const custom = new Set(state.customAllowedHosts);
  const broad = new Set(state.broadAllowedDomains);
  const blocked = new Set(state.blockedHosts);
  if (decision === "permanent") {
    if (scope === "domain") {
      if (policy.isSharedContentHost(normalized)) throw new Error("shared host cannot grant broad access");
      const root = await scopeRoot(normalized);
      if (!root) throw new Error("domain scope unavailable");
      broad.add(root);
      blocked.delete(normalized);
    } else if (scope === "exact") {
      custom.add(normalized);
      blocked.delete(normalized);
    } else throw new Error("invalid scope");
  } else if (decision === "block") {
    blocked.add(normalized);
    custom.delete(normalized);
  } else {
    custom.delete(normalized);
    blocked.delete(normalized);
  }
  if (custom.size > 500 || blocked.size > 500 || broad.size > 500) {
    throw new Error("host limit reached");
  }
  await messenger.storage.local.set({
    customAllowedHosts: [...custom].sort(), broadAllowedDomains: [...broad].sort(),
    blockedHosts: [...blocked].sort()
  });
  return readState();
}

async function registerMessageScript() {
  const existing = await messenger.scripting.messageDisplay.getRegisteredScripts({ ids: [SCRIPT_ID] });
  if (existing.length !== 0) await messenger.scripting.messageDisplay.unregisterScripts({ ids: [SCRIPT_ID] });
  await messenger.scripting.messageDisplay.registerScripts([{
    id: SCRIPT_ID, js: ["policy.js", "access.js", "display.js"], css: ["display.css"],
    runAt: "document_start"
  }]);
}

registerMessageScript().catch(error => {
  console.error("Link Guard could not register its message display script", error);
});

messenger.action.onClicked.addListener(() => messenger.runtime.openOptionsPage());
messenger.messageDisplayAction.onClicked.addListener(() => messenger.runtime.openOptionsPage());
messenger.messageDisplay.onMessagesDisplayed.addListener(tab => {
  messenger.tabs.sendMessage(tab.id, { type: "link-guard-reset-temporary" }).catch(() => {});
});

function updateToolbar(message, tabId) {
  const pending = Number.isInteger(message.pending) ? Math.max(message.pending, 0) : 0;
  const blocked = Number.isInteger(message.blocked) ? Math.max(message.blocked, 0) : 0;
  const warnings = Number.isInteger(message.warnings) ? Math.max(message.warnings, 0) : 0;
  const overflow = message.overflow === true;
  const count = pending + blocked;
  const title = !message.enabled ? messenger.i18n.getMessage("toolbarDisabled") :
    overflow ? messenger.i18n.getMessage("toolbarOverflow") :
    warnings ? messenger.i18n.getMessage("toolbarRisk", [String(warnings)]) :
    count ? messenger.i18n.getMessage("toolbarPending", [String(count)]) :
    messenger.i18n.getMessage("toolbarClear");
  return Promise.all([
    messenger.messageDisplayAction.setBadgeText({ tabId,
      text: overflow || warnings ? "!" : count ? String(Math.min(count, 99)) : "" }),
    messenger.messageDisplayAction.setBadgeBackgroundColor({ tabId,
      color: blocked || warnings ? "#a82232" : "#a85400" }),
    messenger.messageDisplayAction.setTitle({ tabId, title })
  ]).catch(() => { /* Toolbar failures never grant link access. */ });
}

messenger.runtime.onMessage.addListener((message, sender) => {
  if (!Number.isInteger(sender.tab?.id)) return;
  if (message?.type === "link-guard-state") return readState();
  if (message?.type === "link-guard-scope") return scopeRoot(message.host);
  if (message?.type === "link-guard-analyze") return analyzeHosts(message.hosts);
  if (message?.type === "link-guard-validate-broad") return invalidBroadDomain(message.hosts);
  if (message?.type === "link-guard-decision") {
    const result = updateQueue.then(() =>
      setDecision(message.host, message.decision, message.scope));
    updateQueue = result.catch(() => {});
    return result;
  }
  if (message?.type === "link-guard-status") return updateToolbar(message, sender.tab.id);
});
