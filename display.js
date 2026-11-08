"use strict";

(function () {
  const policy = globalThis.LinkGuardPolicy;
  const access = globalThis.LinkGuardAccess;
  // Optional on purpose: if it ever failed to load, links stay protected without
  // custom rules instead of losing protection altogether.
  const warningRules = globalThis.LinkGuardWarnings;
  if (!policy || !access) return;
  if (globalThis.__linkGuardDisplayInstalled) return;
  globalThis.__linkGuardDisplayInstalled = true;
  const MAX_LISTED_LINKS = 500;
  // Upper bound for custom-rule matching per scan (and per click). Matching is linear,
  // so this only matters for hostile messages; once it is used up the remaining links
  // get a "rules not checked" warning rather than passing unchecked.
  const RULE_BUDGET = 10000000;
  const originalHrefs = new WeakMap();
  const inlineWarnings = new WeakMap();
  const trackedAnchors = new Set();
  let state = { enabled: true, allowedHosts: [], blockedHosts: [], blockedDomains: [],
    customAllowedHosts: [], broadAllowedDomains: [], trustedDomains: [],
    disabledWarnings: [], warningRules: [] };
  let warningSettings = { key: "", disabled: new Set(), evaluator: null };
  const temporaryHosts = new Set();
  const analyzedHosts = new Map();
  let analysisPending = false;
  let stateReady = false;
  let panelHost = null;
  let panel = null;
  let observer = null;
  let scheduled = false;
  let lastToolbarStatus = "";
  let errorKey = "";

  const t = globalThis.LinkGuardLocale.getMessage;
  const panelLanguage = globalThis.LinkGuardLocale.effectiveUiLocale(
    messenger.i18n.getUILanguage());

  // SVG anchors may carry their destination in the legacy xlink:href attribute.
  const XLINK_NS = "http://www.w3.org/1999/xlink";

  function liveHref(anchor) {
    const plain = anchor.getAttribute("href");
    if (plain !== null) return plain;
    return anchor.getAttributeNS(XLINK_NS, "href");
  }

  function hasHref(anchor) {
    return anchor.hasAttribute("href") || anchor.hasAttributeNS(XLINK_NS, "href");
  }

  function stripHref(anchor) {
    anchor.removeAttribute("href");
    anchor.removeAttributeNS(XLINK_NS, "href");
  }

  // Puts an approved destination back on the attribute it came from.
  function restoreHref(anchor, value) {
    if (anchor.getAttribute("href") === value) return;
    if (!anchor.hasAttribute("href") && anchor.getAttributeNS(XLINK_NS, "href") === value) return;
    stripHref(anchor);
    if (originalHrefs.get(anchor)?.legacy) anchor.setAttributeNS(XLINK_NS, "xlink:href", value);
    else anchor.setAttribute("href", value);
  }

  function getOriginalHref(anchor) {
    const current = liveHref(anchor);
    const prior = originalHrefs.get(anchor);
    if (current !== null && current !== prior?.value) {
      originalHrefs.set(anchor, { value: current, legacy: !anchor.hasAttribute("href") });
      trackedAnchors.add(anchor);
      return current;
    }
    return prior?.value ?? current;
  }

  // Rebuilt only when the rules change, so the evaluator's result cache survives scans.
  function updateWarningSettings() {
    const key = JSON.stringify([state.disabledWarnings || [], state.warningRules || []]);
    if (key === warningSettings.key) return;
    warningSettings = { key, disabled: new Set(state.disabledWarnings || []),
      evaluator: warningRules ? warningRules.createEvaluator(state.warningRules || []) : null };
  }

  function inspectAnchor(anchor, href, budget) {
    const text = (anchor.textContent || "").slice(0, 1024);
    const inspection = policy.inspectLink(href, text);
    if (!warningRules) return inspection;
    return warningRules.applyWarnings(inspection, { disabled: warningSettings.disabled,
      evaluator: warningSettings.evaluator, href, text, budget });
  }

  // "unverified" (the analysis failed) always warns; it is not a configurable warning.
  function warningFor(host) {
    const analyzed = analyzedHosts.get(host);
    if (analyzed?.kind === "unverified") return analyzed;
    const disabled = warningSettings.disabled;
    if ((analyzed?.kind === "idn" || policy.isInternationalizedHost(host)) && !disabled.has("idn")) {
      return { kind: "idn", similarTo: analyzed?.similarTo || "" };
    }
    if ((analyzed?.kind === "lookalike" || analyzed?.kind === "idn") && analyzed.similarTo &&
        !disabled.has("lookalike")) return { kind: "lookalike", similarTo: analyzed.similarTo };
    return analyzed ? { kind: "none", similarTo: "" } : null;
  }

  function riskText(reason, inline) {
    if (reason === "customSkipped") return t(inline ? "riskCustomSkippedInline" : "riskCustomSkipped");
    if (reason.startsWith("custom:")) {
      const rule = warningSettings.evaluator?.rules[Number(reason.slice(7))];
      if (!rule) return t(inline ? "riskCustomSkippedInline" : "riskCustomSkipped");
      return inline ? t("riskCustomInline", [rule.label]) :
        t("riskCustom", [rule.label, rule.source || t("ruleSourceOwn")]);
    }
    return t(`${inline ? "riskInline" : "risk"}_${reason}`);
  }

  function isAllowed(inspection) {
    return access.linkAllowed(inspection, state, temporaryHosts, warningFor, stateReady);
  }

  function preventUnapprovedClick(event) {
    if (stateReady && !state.enabled) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const anchor = target?.closest("a, area");
    if (!anchor || anchor === panelHost || panelHost?.contains(anchor)) return;
    const href = getOriginalHref(anchor);
    if (href === null) return;
    const inspection = inspectAnchor(anchor, href, { steps: RULE_BUDGET });
    if (inspection.kind === "skip") return;
    if (isAllowed(inspection) && hasHref(anchor)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (panel) panel.open = true;
    panel?.scrollIntoView({ block: "start", behavior: "smooth" });
    panel?.focus({ preventScroll: true });
  }

  // The listener is installed before the settings are loaded. Unknown links fail closed.
  document.addEventListener("click", preventUnapprovedClick, true);
  document.addEventListener("auxclick", preventUnapprovedClick, true);

  function sendToolbar(pending, blocked, warnings, overflow) {
    const message = { type: "link-guard-status", enabled: state.enabled,
      pending, blocked, warnings, overflow };
    const encoded = JSON.stringify(message);
    if (encoded === lastToolbarStatus) return;
    lastToolbarStatus = encoded;
    messenger.runtime.sendMessage(message).catch(() => { lastToolbarStatus = ""; });
  }

  function statusFor(host) {
    if (temporaryHosts.has(host)) return "temporary";
    if (state.blockedDomains?.some(domain => host === domain || host.endsWith(`.${domain}`)))
      return "blocked";
    if (state.blockedHosts.includes(host)) return "blocked";
    if (state.customAllowedHosts.includes(host)) return "permanent";
    const warning = warningFor(host);
    if (!warning || warning.kind !== "none") return "pending";
    if (state.allowedHosts.includes(host)) return "permanent";
    if (!policy.isSharedContentHost(host) && state.broadAllowedDomains.some(domain =>
      host === domain || host.endsWith(`.${domain}`))) return "broad";
    return "pending";
  }

  async function decide(host, decision, scope = "exact") {
    try {
      if (decision === "temporary") {
        temporaryHosts.add(policy.isIpAddress(host) ? host : policy.normalizeHost(host));
        errorKey = "";
        scan();
        return;
      }
      state = await messenger.runtime.sendMessage({
        type: "link-guard-decision", host, decision, scope
      });
      temporaryHosts.delete(host);
      analyzedHosts.clear();
      updateWarningSettings();
      stateReady = true;
      errorKey = "";
      scan();
    } catch {
      errorKey = "saveFailed";
      scan();
    }
  }

  function button(labelKey, host, decision) {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = t(labelKey);
    control.disabled = !stateReady;
    control.addEventListener("click", () => decide(host, decision));
    return control;
  }

  function riskyApproval(host, actions) {
    const chooser = document.createElement("div");
    chooser.className = "link-guard-risk-confirm";
    const warning = document.createElement("strong");
    warning.textContent = t("riskyApprovalWarning");
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = t("riskyApprovalConfirm");
    confirm.addEventListener("click", () => decide(host, "temporary"));
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = t("cancelPreview");
    cancel.addEventListener("click", () => scan());
    chooser.append(warning, confirm, cancel);
    actions.replaceChildren(chooser);
  }

  async function chooseScope(host, actions, decision) {
    const chooser = document.createElement("div");
    chooser.className = "link-guard-scope-choice";
    const explanation = document.createElement("p");
    explanation.textContent = t(decision === "block" ? "blockScopePrompt" :
      policy.isSharedContentHost(host) ? "scopePromptShared" : "scopePrompt");
    const exact = document.createElement("button");
    exact.type = "button";
    exact.textContent = t("scopeExact", [host]);
    exact.addEventListener("click", () => decide(host, decision, "exact"));
    chooser.append(explanation, exact);
    try {
      const root = await messenger.runtime.sendMessage({ type: "link-guard-scope", host });
      if (root && (decision === "block" || !policy.isSharedContentHost(host))) {
        const broad = document.createElement("button");
        broad.type = "button";
        broad.textContent = t("scopeBroad", [root]);
        broad.addEventListener("click", () => decide(host, decision, "domain"));
        chooser.append(broad);
      }
    } catch { /* Exact decision remains available if the suffix list fails. */ }
    actions.replaceChildren(chooser);
  }

  function makeHostRow(host, count, risks) {
    const row = document.createElement("div");
    row.className = "link-guard-row";
    const information = document.createElement("div");
    information.className = "link-guard-row-info";
    const name = document.createElement("strong");
    name.textContent = host;
    const status = document.createElement("span");
    const temporaryOnly = risks?.has("shortLink");
    const statusKey = statusFor(host) === "blocked" ? "blocked" :
      temporaryOnly && !temporaryHosts.has(host) ? "pending" :
      risks?.size && !temporaryHosts.has(host) &&
      !state.customAllowedHosts.includes(host) ? "pending" : statusFor(host);
    status.className = `link-guard-state link-guard-state-${statusKey}`;
    status.textContent = t(`status_${statusKey}`);
    information.append(name, status);
    const warning = warningFor(host);
    if (warning && warning.kind !== "none") {
      const risk = document.createElement("strong");
      risk.className = "link-guard-risk";
      risk.textContent = warning.kind === "idn" ? t("riskIdn") :
        warning.kind === "unverified" ? t("riskUnverified") :
          t("riskLookalike", [warning.similarTo]);
      information.append(risk);
    }
    for (const reason of risks || []) {
      const detail = document.createElement("strong");
      detail.className = "link-guard-risk";
      detail.textContent = riskText(reason, false);
      information.append(detail);
    }
    const actions = document.createElement("div");
    actions.className = "link-guard-actions";
    if (temporaryOnly) {
      const temporary = document.createElement("button");
      temporary.type = "button";
      temporary.textContent = t("allowTemporary");
      temporary.disabled = !stateReady;
      temporary.addEventListener("click", () => riskyApproval(host, actions));
      actions.append(temporary);
    } else actions.append(button("allowTemporary", host, "temporary"));
    if (!policy.isIpAddress(host)) {
      if (!temporaryOnly) {
        const permanent = document.createElement("button");
        permanent.type = "button";
        permanent.textContent = t("allowPermanent");
        permanent.disabled = !stateReady;
        permanent.addEventListener("click", () => chooseScope(host, actions, "permanent"));
        actions.append(permanent);
      }
      const block = document.createElement("button");
      block.type = "button";
      block.textContent = t("blockHost");
      block.disabled = !stateReady;
      block.addEventListener("click", () => chooseScope(host, actions, "block"));
      actions.append(block);
    }
    row.append(information, actions);
    return row;
  }

  // Properties set inline with !important beat every message-authored rule, so a message
  // cannot hide, move, fade out or restyle the panel's box.
  const HOST_STYLE = [["display", "block"], ["position", "relative"], ["visibility", "visible"],
    ["opacity", "1"], ["margin", "0 0 10px"], ["padding", "0"], ["border", "0"],
    ["z-index", "2147483647"], ["width", "auto"], ["height", "auto"], ["max-height", "none"],
    ["overflow", "visible"], ["transform", "none"], ["filter", "none"], ["clip-path", "none"],
    ["mask", "none"], ["pointer-events", "auto"], ["contain", "none"], ["float", "none"]];

  // The panel lives in a closed shadow root: message CSS cannot reach its elements and
  // message scripts cannot walk into it.
  function createPanel() {
    panelHost?.remove();
    panelHost = document.createElement("div");
    panelHost.style.setProperty("all", "initial", "important");
    for (const [property, value] of HOST_STYLE) {
      panelHost.style.setProperty(property, value, "important");
    }
    const shadow = panelHost.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = globalThis.LinkGuardPanelCss || "";
    panel = document.createElement("details");
    panel.className = "link-guard-panel";
    panel.lang = panelLanguage;
    panel.tabIndex = -1;
    shadow.append(style, panel);
    document.body.prepend(panelHost);
  }

  function renderPanel(groups, hardBlocks, linkRisks, totalWeb, pending, blocked, warnings, overflow) {
    if (!document.body) return;
    if (!state.enabled || (pending + blocked + warnings === 0 && !overflow)) {
      panelHost?.remove();
      panelHost = null;
      panel = null;
      return;
    }
    if (!panel || !panelHost?.isConnected) createPanel();
    const summaryLine = document.createElement("summary");
    summaryLine.textContent = warnings ?
      t("panelCompactRisk", [String(pending + blocked), String(warnings)]) :
      t("panelCompact", [String(pending + blocked)]);
    summaryLine.className = warnings ? "link-guard-summary-risk" : "";
    const content = document.createElement("div");
    content.className = "link-guard-expanded";
    const heading = document.createElement("h2");
    heading.textContent = t("panelTitle");
    const list = document.createElement("div");
    list.className = "link-guard-list";
    for (const [host, count] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      list.append(makeHostRow(host, count, linkRisks.get(host)));
    }
    if (hardBlocks.size) {
      const hardTitle = document.createElement("h3");
      hardTitle.textContent = t("unsafeTitle");
      list.append(hardTitle);
      for (const [key, count] of hardBlocks) {
        const [reason, host] = key.split("|", 2);
        const item = document.createElement("p");
        item.className = "link-guard-unsafe";
        item.textContent = `${host || t("unknownHost")}: ${t(`reason_${reason}`)} (${count})`;
        list.append(item);
      }
    }
    const elements = [heading, list];
    if (overflow) {
      const footer = document.createElement("p");
      footer.className = "link-guard-footer";
      footer.textContent = t("overflowNotice");
      elements.push(footer);
    }
    if (!stateReady || errorKey) {
      const error = document.createElement("p");
      error.className = "link-guard-error";
      error.textContent = t(errorKey || "stateUnavailable");
      elements.push(error);
    }
    content.append(...elements);
    panel.replaceChildren(summaryLine, content);
  }

  function markInline(anchor, warning, risks, host = "") {
    const existing = inlineWarnings.get(anchor);
    const risky = Boolean(risks?.length || (warning && warning.kind !== "none"));
    const showHost = host && !policy.apparentHost((anchor.textContent || "").slice(0, 1024));
    if (anchor.tagName !== "A" || (!risky && !showHost)) {
      existing?.remove();
      inlineWarnings.delete(anchor);
      return;
    }
    const hostLabel = !warning || warning.kind === "none" ? "" :
      warning.kind === "idn" ? t("riskIdnInline") :
        warning.kind === "unverified" ? t("riskUnverifiedInline") :
          t("riskLookalikeInline", [warning.similarTo]);
    const label = [hostLabel, ...(risks || []).map(reason => riskText(reason, true)),
      showHost ? t("linkDestinationInline", [host]) : ""]
      .filter(Boolean).join(" · ");
    if (existing?.isConnected) {
      if (existing.textContent !== label) existing.textContent = label;
      existing.className = risky ? "link-guard-inline-warning" : "link-guard-inline-destination";
      return;
    }
    const marker = document.createElement("strong");
    marker.className = risky ? "link-guard-inline-warning" : "link-guard-inline-destination";
    if (risky) marker.setAttribute("role", "alert");
    marker.textContent = label;
    anchor.after(marker);
    inlineWarnings.set(anchor, marker);
  }

  function analyzeUnknown(hosts) {
    if (analysisPending || !stateReady || !hosts.length) return;
    analysisPending = true;
    messenger.runtime.sendMessage({ type: "link-guard-analyze", hosts }).then(result => {
      for (const host of hosts) {
        analyzedHosts.set(host, result?.[host] || { kind: "unverified", similarTo: "" });
      }
    }).catch(() => {
      for (const host of hosts) analyzedHosts.set(host, { kind: "unverified", similarTo: "" });
    }).finally(() => { analysisPending = false; scan(); });
  }

  function scan() {
    if (!document.body) return;
    for (const anchor of trackedAnchors) {
      if (!anchor.isConnected) {
        inlineWarnings.get(anchor)?.remove();
        inlineWarnings.delete(anchor);
        trackedAnchors.delete(anchor);
        originalHrefs.delete(anchor);
      }
    }
    if (stateReady && !state.enabled) {
      for (const anchor of trackedAnchors) {
        markInline(anchor, null, []);
        const original = originalHrefs.get(anchor);
        if (original !== undefined) restoreHref(anchor, original.value);
      }
      renderPanel(new Map(), new Map(), new Map(), 0, 0, 0, 0, false);
      sendToolbar(0, 0, 0, false);
      return;
    }
    const groups = new Map();
    const hardBlocks = new Map();
    const linkRisks = new Map();
    const anchors = document.querySelectorAll("a, area");
    let totalWeb = 0;
    let pending = 0;
    let blocked = 0;
    let warnings = 0;
    let inspected = 0;
    const unknown = new Set();
    const budget = { steps: RULE_BUDGET };
    for (const anchor of anchors) {
      const href = getOriginalHref(anchor);
      if (href === null) continue;
      const inspection = inspectAnchor(anchor, href, budget);
      if (inspection.kind === "skip") continue;
      if (inspection.kind === "web") {
        for (const host of inspection.hosts) {
          if (!policy.isIpAddress(host) && !analyzedHosts.has(host)) unknown.add(host);
        }
      }
      inspected++;
      const withinLimit = inspected <= MAX_LISTED_LINKS;
      const approved = withinLimit && isAllowed(inspection);
      const warning = inspection.kind === "web" ?
        inspection.hosts.map(warningFor).find(value => value && value.kind !== "none") : null;
      markInline(anchor, warning, inspection.risks || [], inspection.host);
      if (approved) restoreHref(anchor, href);
      else if (hasHref(anchor)) stripHref(anchor);
      if (!withinLimit) { blocked++; continue; }
      if (inspection.kind === "blocked") {
        blocked++;
        const key = `${inspection.reason}|${inspection.host}`;
        hardBlocks.set(key, (hardBlocks.get(key) || 0) + 1);
        continue;
      }
      totalWeb++;
      if (warning || inspection.risks?.length) warnings++;
      for (const host of inspection.hosts) groups.set(host, (groups.get(host) || 0) + 1);
      if (inspection.risks?.length) {
        for (const host of inspection.hosts) {
          const risks = linkRisks.get(host) || new Set();
          for (const risk of inspection.risks) risks.add(risk);
          linkRisks.set(host, risks);
        }
      }
      if (!approved) {
        if (inspection.hosts.some(host => statusFor(host) === "blocked")) blocked++;
        else pending++;
      }
    }
    const overflow = inspected > MAX_LISTED_LINKS;
    renderPanel(groups, hardBlocks, linkRisks, totalWeb, pending, blocked, warnings, overflow);
    sendToolbar(pending, blocked, warnings, overflow);
    analyzeUnknown([...unknown].slice(0, 500));
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 0);
  }

  function isOwnMutation(mutation) {
    if (!panelHost) return false;
    if (panelHost.contains(mutation.target)) return true;
    const targetElement = mutation.target.nodeType === Node.ELEMENT_NODE ?
      mutation.target : mutation.target.parentElement;
    if (targetElement?.closest?.(".link-guard-inline-warning, .link-guard-inline-destination")) return true;
    if (mutation.type !== "childList") return false;
    const changed = [...mutation.addedNodes, ...mutation.removedNodes];
    return changed.length > 0 && changed.every(node => node === panelHost ||
      (node.nodeType === Node.ELEMENT_NODE &&
        (node.classList?.contains("link-guard-inline-warning") ||
         node.classList?.contains("link-guard-inline-destination"))));
  }

  async function loadState() {
    try {
      state = await messenger.runtime.sendMessage({ type: "link-guard-state" });
      analyzedHosts.clear();
      updateWarningSettings();
      stateReady = true;
      errorKey = "";
    } catch {
      stateReady = false;
      errorKey = "stateUnavailable";
    }
    scan();
  }

  function initialize() {
    if (!document.body) return;
    scan();
    observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => !isOwnMutation(mutation))) scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["href"] });
    loadState();
  }

  if (document.body) initialize();
  else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    setTimeout(initialize, 0);
  }
  messenger.storage.onChanged.addListener((changes, area) => {
    if (area === "local") loadState();
  });
  messenger.runtime.onMessage.addListener(message => {
    if (message?.type === "link-guard-reset-temporary") {
      temporaryHosts.clear();
      scan();
    }
  });
})();
