"use strict";

const policy = globalThis.LinkGuardPolicy;
const listImport = globalThis.LinkGuardImport;
const domainScope = globalThis.LinkGuardDomainScope;
const warningRules = globalThis.LinkGuardWarnings;
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

async function cleanBroadDomains(value, limit = 500) {
  if (!Array.isArray(value)) return [];
  const roots = new Set();
  for (const entry of value.slice(0, limit)) {
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

const covers = (domains, host) =>
  domains.some(domain => host === domain || host.endsWith(`.${domain}`));

// Enabled imported block lists add to the user's own blocks. Wildcards that are not
// a verified registrable domain are dropped: they never block more than intended.
async function importedBlocks(lists) {
  const hosts = new Set();
  const wildcards = [];
  for (const list of lists) {
    if (!list.enabled || list.kind !== "block") continue;
    for (const entry of list.hosts) {
      if (entry.startsWith("*.")) wildcards.push(entry.slice(2));
      else hosts.add(entry);
    }
  }
  const domains = await cleanBroadDomains(wildcards, listImport.MAX_LISTS * listImport.MAX_HOSTS);
  return { hosts: [...hosts].sort(), domains };
}

// Cleaning thousands of imported entries on every message display is wasteful, so the
// result is reused until the stored lists change.
let importedCache = { key: "", lists: [], blocks: { hosts: [], domains: [] } };

// Warning rules are re-validated (and their patterns compiled) on every read, which is
// cheap but not free, so the cleaned result is reused until the stored data changes.
let warningCache = { key: "", value: null };

function warningData(local) {
  const key = JSON.stringify([local.disabledWarnings ?? [], local.customWarnings ?? [],
    local.warningLists ?? []]);
  if (warningCache.key !== key) {
    const lists = warningRules.cleanStoredLists(local.warningLists);
    warningCache = { key, value: {
      disabledWarnings: warningRules.cleanDisabled(local.disabledWarnings),
      warningRules: warningRules.effectiveRules(warningRules.cleanRules(local.customWarnings), lists)
    } };
  }
  return warningCache.value;
}

async function importedData(raw) {
  const key = JSON.stringify(raw ?? []);
  if (importedCache.key !== key) {
    const lists = listImport.cleanStored(raw);
    importedCache = { key, lists, blocks: await importedBlocks(lists) };
  }
  return importedCache;
}

// The public state seen by message pages. `blockedHosts` and `blockedDomains` are the
// effective blocks (own rules plus enabled imported block lists). Own rules are kept
// apart so a decision never copies an imported entry into the user's stored lists.
// The full state is derived from all stored rules and lists, which can hold 100,000
// hosts. It is computed once and reused until local storage changes, instead of on every
// displayed message. Where no change notification exists (the unit-test harness), it is
// computed on every call, so a stale result is never served.
const canCacheState = Boolean(messenger.storage?.onChanged?.addListener);
let stateCache = null;

function invalidateState() { stateCache = null; }

if (canCacheState) {
  messenger.storage.onChanged.addListener((changes, area) => {
    if (area === "local") invalidateState();
  });
}

function readFullState() {
  if (!canCacheState) return computeFullState();
  if (!stateCache) {
    const pending = computeFullState();
    stateCache = pending;
    pending.catch(() => { if (stateCache === pending) stateCache = null; });
  }
  return stateCache;
}

async function computeFullState() {
  const local = await messenger.storage.local.get({
    enabled: true, showDestinations: true, customAllowedHosts: [], blockedHosts: [],
    blockedDomains: [], importedLists: [], broadAllowedDomains: [],
    disabledWarnings: [], customWarnings: [], warningLists: []
  });
  const customAllowedHosts = cleanHosts(local.customAllowedHosts);
  const blockedHosts = cleanHosts(local.blockedHosts);
  const blockedDomains = await cleanBroadDomains(local.blockedDomains);
  const broadAllowedDomains = await cleanBroadDomains(local.broadAllowedDomains);
  const { lists: importedLists, blocks: imported } = await importedData(local.importedLists);
  const allBlockedHosts = [...new Set([...blockedHosts, ...imported.hosts])].sort();
  const allBlockedDomains = [...new Set([...blockedDomains, ...imported.domains])].sort();
  const approved = new Set(customAllowedHosts);
  for (const list of importedLists) {
    if (list.enabled && list.kind === "allow") for (const host of list.hosts) approved.add(host);
  }
  // The user's own blocks remove an approval. Imported blocks do not: the references for
  // lookalike warnings must not be something a remote list can shrink.
  for (const host of blockedHosts) approved.delete(host);
  for (const host of approved) {
    if (covers(blockedDomains, host)) approved.delete(host);
  }
  const rules = await publicSuffixRules();
  const trustedDomains = new Set(broadAllowedDomains);
  for (const host of approved) {
    const root = domainScope.registrableDomain(host, rules);
    if (root) trustedDomains.add(root);
  }
  const effective = new Set(approved);
  for (const host of imported.hosts) effective.delete(host);
  for (const host of effective) {
    if (covers(imported.domains, host)) effective.delete(host);
  }
  // Only an explicit false hides the destination labels; anything else keeps the default.
  return { enabled: local.enabled !== false, showDestinations: local.showDestinations !== false,
    customAllowedHosts,
    blockedHosts: allBlockedHosts, blockedDomains: allBlockedDomains,
    broadAllowedDomains,
    allowedHosts: [...effective], trustedDomains: [...trustedDomains],
    ...warningData(local),
    ownBlockedHosts: blockedHosts, ownBlockedDomains: blockedDomains,
    importedBlockedHosts: imported.hosts, importedBlockedDomains: imported.domains };
}

// Message pages need the effective rules, not the imported lists themselves. They do get
// the user's own blocks, to offer "Unblock" only where removing a block of one's own
// actually unblocks the host.
async function readState() {
  const { importedBlockedHosts, importedBlockedDomains, ...state } = await readFullState();
  return state;
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

// Registrable domain of each hostname, or null when it is not a valid hostname under a
// known public suffix. Message pages use it to compare a domain named in link text
// ("sparkasse.de") with the link's real destination. Pairs keep arbitrary input from
// becoming object keys.
async function registrableDomains(hosts) {
  if (!Array.isArray(hosts) || hosts.length > 500) throw new Error("host limit");
  const rules = await publicSuffixRules();
  return hosts.filter(value => typeof value === "string").map(value => {
    try { return [value, domainScope.registrableDomain(policy.normalizeHost(value), rules)]; }
    catch { return [value, null]; }
  });
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
  if (!["permanent", "block", "clear", "unblock"].includes(decision)) {
    throw new Error("invalid decision");
  }
  const state = await readFullState();
  const custom = new Set(state.customAllowedHosts);
  const broad = new Set(state.broadAllowedDomains);
  const blocked = new Set(state.ownBlockedHosts);
  const blockedDomains = new Set(state.ownBlockedDomains);
  // An imported block list is not editable here; an approval would have no effect.
  const importedBlocked = host => state.importedBlockedHosts.includes(host) ||
    covers(state.importedBlockedDomains, host);
  if (decision === "permanent") {
    if (scope === "domain") {
      if (policy.isSharedContentHost(normalized)) throw new Error("shared host cannot grant broad access");
      const root = await scopeRoot(normalized);
      if (!root) throw new Error("domain scope unavailable");
      if (covers(state.importedBlockedDomains, root)) {
        throw new Error("blocked by an imported list");
      }
      broad.add(root);
      blockedDomains.delete(root);
      blocked.delete(normalized);
    } else if (scope === "exact") {
      if (covers([...blockedDomains], normalized)) {
        throw new Error("remove whole-domain block before approving an exact host");
      }
      if (importedBlocked(normalized)) throw new Error("blocked by an imported list");
      custom.add(normalized);
      blocked.delete(normalized);
    } else throw new Error("invalid scope");
  } else if (decision === "block") {
    if (scope === "domain") {
      const root = await scopeRoot(normalized);
      if (!root) throw new Error("domain scope unavailable");
      blockedDomains.add(root);
      broad.delete(root);
      for (const allowed of custom) {
        if (allowed === root || allowed.endsWith(`.${root}`)) custom.delete(allowed);
      }
    } else if (scope === "exact") {
      blocked.add(normalized);
      custom.delete(normalized);
    } else throw new Error("invalid scope");
  } else if (decision === "unblock") {
    // Removes the user's own block only; an imported blocklist is changed in Settings.
    if (scope === "domain") {
      const root = await scopeRoot(normalized);
      if (!root || !blockedDomains.has(root)) throw new Error("no whole-domain block");
      blockedDomains.delete(root);
      blocked.delete(normalized);
    } else if (scope === "exact") {
      if (!blocked.has(normalized)) throw new Error("no block");
      blocked.delete(normalized);
    } else throw new Error("invalid scope");
  } else {
    if (scope !== "exact") throw new Error("invalid scope");
    custom.delete(normalized);
    blocked.delete(normalized);
  }
  if (custom.size > 500 || blocked.size + blockedDomains.size > 500 || broad.size > 500) {
    throw new Error("host limit reached");
  }
  await messenger.storage.local.set({
    customAllowedHosts: [...custom].sort(), broadAllowedDomains: [...broad].sort(),
    blockedHosts: [...blocked].sort(), blockedDomains: [...blockedDomains].sort()
  });
  // storage.onChanged arrives later; the state returned now must already include this
  // decision, also if another request cached the old state while it was being written.
  invalidateState();
  return readState();
}

// Enabled remote blocklists with automatic updates are re-fetched about daily. An update
// replaces only the host entries of a list that is still a blocklist from the same
// source; it never enables a list and never touches allowlists. Anything that fails or
// changes the list type leaves the stored list as it was.
let refreshPromise = null;

async function refreshBlocklists() {
  const stored = await messenger.storage.local.get({ importedLists: [] });
  // Cheap check on the raw data first: most users have no auto-updating list.
  if (!Array.isArray(stored.importedLists) ||
      !stored.importedLists.some(list => list?.enabled === true && list.kind === "block" &&
        list.autoRefresh !== false && list.sourceUrl)) return;
  const now = Date.now();
  const due = listImport.cleanStored(stored.importedLists)
    .filter(list => listImport.autoRefreshDue(list, now));
  if (!due.length) return;
  const results = new Map();
  const full = await readFullState();
  const approval = { hosts: [...new Set([...full.customAllowedHosts, ...full.allowedHosts])],
    domains: full.broadAllowedDomains };
  for (const list of due) {
    const result = { sourceUrl: list.sourceUrl, refreshedAt: now };
    try {
      const fetched = await listImport.fetchRemote(list.sourceUrl, (...args) => fetch(...args));
      if (fetched.kind !== "block") result.refreshStatus = "kindChanged";
      else if (listImport.assessAutoUpdate(list.hosts, fetched.hosts,
        approval.hosts, approval.domains) === "ok") {
        Object.assign(result, { hosts: fetched.hosts, refreshStatus: "ok" });
      } else result.refreshStatus = "review";
    } catch { result.refreshStatus = "failed"; }
    results.set(list.id, result);
  }
  // Re-read so that edits saved in Settings during the fetch are not overwritten.
  const current = await messenger.storage.local.get({ importedLists: [] });
  const merged = listImport.cleanStored(current.importedLists).map(list => {
    const result = results.get(list.id);
    if (!result || result.sourceUrl !== list.sourceUrl || !listImport.autoRefreshDue(list, now)) {
      return list;
    }
    const { sourceUrl, ...changes } = result;
    return { ...list, ...changes };
  });
  await messenger.storage.local.set({ importedLists: merged });
  invalidateState();
}

function scheduleRefresh() {
  if (refreshPromise) return;
  refreshPromise = refreshBlocklists()
    .catch(() => { /* A failed update keeps the stored list. */ })
    .finally(() => { refreshPromise = null; });
}

scheduleRefresh();

// Manifest scripts cover messages as Thunderbird restores them. An update can also
// leave a message already open, so inject into those documents once at startup.
async function protectOpenMessages() {
  const tabs = await messenger.tabs.query({ type: ["mail", "messageDisplay"] });
  for (const tab of tabs) {
    try {
      if (tab.type === "mail") {
        const displayed = await messenger.messageDisplay.getDisplayedMessages(tab.id);
        if (displayed.messages?.length !== 1) continue;
      }
      const target = { tabId: tab.id };
      const probe = await messenger.scripting.executeScript({ target,
        func: () => Boolean(globalThis.__linkGuardDisplayInstalled) });
      if (probe.some(result => result.result === true)) continue;
      await messenger.scripting.insertCSS({ target, files: ["display.css"] });
      await messenger.scripting.executeScript({ target,
        files: ["english.js", "locale.js", "policy.js", "access.js", "safe-regex.js", "warning-rules.js",
          "panel-style.js", "display.js"] });
    } catch (error) {
      console.error("Link Guard could not protect an already open message", error);
    }
  }
}

protectOpenMessages().catch(error => {
  console.error("Link Guard could not inspect open message tabs", error);
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
  const t = globalThis.LinkGuardLocale.getMessage;
  const title = !message.enabled ? t("toolbarDisabled") :
    overflow ? t("toolbarOverflow") :
    warnings ? t("toolbarRisk", [String(warnings)]) :
    count ? t("toolbarPending", [String(count)]) : t("toolbarClear");
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
  if (message?.type === "link-guard-state") {
    scheduleRefresh();
    return readState();
  }
  if (message?.type === "link-guard-scope") return scopeRoot(message.host);
  if (message?.type === "link-guard-analyze") return analyzeHosts(message.hosts);
  if (message?.type === "link-guard-roots") return registrableDomains(message.hosts);
  if (message?.type === "link-guard-validate-broad") return invalidBroadDomain(message.hosts);
  if (message?.type === "link-guard-decision") {
    const result = updateQueue.then(() =>
      setDecision(message.host, message.decision, message.scope));
    updateQueue = result.catch(() => {});
    return result;
  }
  if (message?.type === "link-guard-status") return updateToolbar(message, sender.tab.id);
  if (message?.type === "link-guard-open-settings") return messenger.runtime.openOptionsPage();
});
