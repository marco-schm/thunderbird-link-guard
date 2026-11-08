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
  let state = { enabled: true, showDestinations: true, allowedHosts: [], blockedHosts: [], blockedDomains: [],
    customAllowedHosts: [], broadAllowedDomains: [], trustedDomains: [],
    disabledWarnings: [], warningRules: [] };
  let warningSettings = { key: "", disabled: new Set(), evaluator: null };
  const temporaryHosts = new Set();
  const analyzedHosts = new Map();
  // Registrable domains from the background (Public Suffix List), for hostnames named in
  // link text and for link destinations. They do not depend on settings, so they are
  // kept for the lifetime of the message.
  const registrableRoots = new Map();
  const unknownRoots = new Set();
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
  const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

  // Link Guard must recognise every element that Thunderbird's own click handling
  // (BrowserUtils.hrefAndLinkNodeForClickEvent) opens as a link: <a> in any namespace,
  // <area>, and any MathML element with an href. MathML elements are selected whether or
  // not they still carry an href, so one whose href was removed can be restored later.
  // HTML <link> elements are links to Thunderbird too; they are hidden instead (see
  // hideLinkElements), because removing their href would also drop stylesheets.
  const CANDIDATES = "a, area, math, math *";

  function isLinkCandidate(element) {
    return element.localName === "a" || element.localName === "area" ||
      element.namespaceURI === MATHML_NS;
  }

  // Shadow trees, open or closed, are part of what Thunderbird follows on a click.
  // openOrClosedShadowRoot is available to extension scripts only.
  function shadowRootOf(element) {
    if (element === panelHost || labelTexts.has(element)) return null;
    try { return element.openOrClosedShadowRoot || element.shadowRoot || null; }
    catch { return null; }
  }

  const OBSERVE = { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] };
  const listenedRoots = new WeakSet();
  const observedRoots = new WeakSet();

  function watchShadowRoot(root) {
    if (!listenedRoots.has(root)) {
      // A listener inside the tree sees the real click target even when the tree is
      // closed and the event reaches the document retargeted to its host.
      root.addEventListener("click", preventUnapprovedClick, true);
      root.addEventListener("auxclick", preventUnapprovedClick, true);
      listenedRoots.add(root);
    }
    if (observer && !observedRoots.has(root)) {
      observer.observe(root, OBSERVE);
      observedRoots.add(root);
    }
  }

  // The document and every shadow tree in it, in document order of discovery.
  function linkScopes() {
    const scopes = [document];
    for (let index = 0; index < scopes.length; index++) {
      for (const element of scopes[index].querySelectorAll("*")) {
        const root = shadowRootOf(element);
        if (root) {
          watchShadowRoot(root);
          scopes.push(root);
        }
      }
    }
    return scopes;
  }

  // An HTML <link> is never meant to be shown, but message CSS can make it a clickable box
  // that Thunderbird opens like an anchor. Hiding it keeps stylesheets working.
  function hideLinkElements(scope) {
    for (const element of scope.querySelectorAll("link")) {
      if (element.style.getPropertyValue("display") !== "none" ||
          element.style.getPropertyPriority("display") !== "important") {
        element.style.setProperty("display", "none", "important");
      }
    }
  }

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

  // Link text that names a bare domain ("sparkasse.de") while the link leads elsewhere.
  // Returns "textMismatch", "pending" while the background has not yet said whether the
  // text names a real domain, or null. Domains are compared by registrable domain, so
  // "firma.de" linking to www.firma.de is not a mismatch; a text with a scheme or "www."
  // keeps the exact comparison done in policy.inspectLink.
  function bareTextRisk(inspection, text) {
    if (inspection.kind !== "web" || policy.apparentHost(text)) return null;
    const claimed = policy.bareHostCandidate(text);
    if (!claimed || claimed === inspection.host) return null;
    if (!registrableRoots.has(claimed) || !registrableRoots.has(inspection.host)) {
      unknownRoots.add(claimed);
      unknownRoots.add(inspection.host);
      return "pending";
    }
    const claimedRoot = registrableRoots.get(claimed);
    if (!claimedRoot) return null;
    const actualRoot = registrableRoots.get(inspection.host);
    return (actualRoot ? actualRoot !== claimedRoot : claimed !== inspection.host) ?
      "textMismatch" : null;
  }

  function inspectAnchor(anchor, href, budget) {
    const text = (anchor.textContent || "").slice(0, 1024);
    // The base URI is read per inspection: a message can carry a `<base href>` that
    // decides where a relative href or a bare fragment actually leads.
    const base = document.baseURI;
    let inspection = policy.inspectLink(href, text, base);
    const bare = bareTextRisk(inspection, text);
    if (bare === "textMismatch" && !inspection.risks?.includes("textMismatch")) {
      inspection = { ...inspection, risks: [...(inspection.risks || []), "textMismatch"] };
    }
    if (warningRules) {
      // Rules are matched against the destination a click would open, not the raw
      // attribute, so a base-relative link cannot slip past a rule written for its URL.
      const target = policy.resolveHref(href, base)?.href || href;
      inspection = warningRules.applyWarnings(inspection, { disabled: warningSettings.disabled,
        evaluator: warningSettings.evaluator, href: target, text, budget });
    }
    // Until the text is checked the link stays closed, whatever its host's approval.
    return bare === "pending" ? { ...inspection, pendingText: true } : inspection;
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
    if (inspection.pendingText) return false;
    return access.linkAllowed(inspection, state, temporaryHosts, warningFor, stateReady);
  }

  // Mirrors Thunderbird's lookup: walk up from the real target (into shadow trees as far
  // as this listener can see) and take the first link candidate that has a destination;
  // a candidate without one is passed over, as Thunderbird does.
  function clickedLink(event) {
    for (const node of event.composedPath()) {
      if (node === panelHost) return null;
      if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
      // A hidden <link> cannot normally be clicked. If a click reaches one anyway, it is
      // checked like an anchor and passes only when its destination is approved.
      if (node.localName === "link" && node.namespaceURI === document.documentElement.namespaceURI) {
        const href = node.getAttribute("href");
        if (href !== null) return { element: node, href };
        continue;
      }
      if (!isLinkCandidate(node)) continue;
      const href = getOriginalHref(node);
      if (href !== null) return { element: node, href };
    }
    return null;
  }

  function preventUnapprovedClick(event) {
    if (stateReady && !state.enabled) return;
    const found = clickedLink(event);
    if (!found) return;
    const { element: anchor, href } = found;
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

  // The inline labels sit in the message's own DOM, so they get the panel host's
  // treatment: every property reset and then set inline with !important, which no
  // message rule can override. A stylesheet left opacity, size, position, transform and
  // clip-path to the message, and does not reach labels inside a shadow tree at all.
  // `all` leaves direction and unicode-bidi alone, so those are pinned as well.
  const LABEL_BASE = [["display", "inline-block"], ["position", "relative"],
    ["z-index", "2147483647"], ["visibility", "visible"], ["opacity", "1"],
    ["direction", "ltr"], ["unicode-bidi", "isolate"], ["text-decoration", "none"],
    ["white-space", "normal"], ["pointer-events", "auto"]];
  const LABEL_LOOK = {
    warning: [["margin", "3px 5px"], ["padding", "3px 7px"], ["border", "2px solid #b42332"],
      ["border-radius", "4px"], ["background", "#b42332"], ["color", "#fff"],
      ["font", "800 13px/1.3 system-ui, sans-serif"]],
    destination: [["margin", "2px 4px"], ["padding", "1px 4px"], ["border-radius", "3px"],
      ["background", "#edf2f7"], ["color", "#253449"],
      ["font", "600 11px/1.3 system-ui, sans-serif"]]
  };

  function styleLabel(marker, risky) {
    marker.style.setProperty("all", "initial", "important");
    for (const [property, value] of [...LABEL_BASE, ...LABEL_LOOK[risky ? "warning" : "destination"]]) {
      marker.style.setProperty(property, value, "important");
    }
  }

  // Inline styles cannot reach pseudo-elements, so a message could still inject text
  // into a label with ::before/::after or fade its text with ::first-line. The text
  // therefore lives in a closed shadow root whose !important rules outrank the
  // message's own !important rules for the host's pseudo-elements.
  const labelTexts = new WeakMap();

  function createLabel(risky, text) {
    const marker = document.createElement("span");
    marker.className = risky ? "link-guard-inline-warning" : "link-guard-inline-destination";
    styleLabel(marker, risky);
    if (risky) marker.setAttribute("role", "alert");
    const shadow = marker.attachShadow({ mode: "closed" });
    const guard = document.createElement("style");
    guard.textContent = globalThis.LinkGuardHostGuardCss || "";
    const content = document.createElement("span");
    content.textContent = text;
    shadow.append(guard, content);
    labelTexts.set(marker, content);
    return marker;
  }

  function markInline(anchor, warning, risks, host = "") {
    const existing = inlineWarnings.get(anchor);
    const risky = Boolean(risks?.length || (warning && warning.kind !== "none"));
    const showHost = host && !policy.apparentHost((anchor.textContent || "").slice(0, 1024));
    // The setting only drops the neutral "↗ host" label of an unremarkable link, which can
    // disturb a message's layout. A warning label is always shown, destination included.
    const destinationOnly = !risky && showHost;
    if (anchor.tagName !== "A" || (!risky && !showHost) ||
        (destinationOnly && state.showDestinations === false)) {
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
    const className = risky ? "link-guard-inline-warning" : "link-guard-inline-destination";
    const content = existing && labelTexts.get(existing);
    if (existing?.isConnected && content) {
      if (content.textContent !== label) content.textContent = label;
      if (existing.className !== className) {
        existing.className = className;
        styleLabel(existing, risky);
        if (risky) existing.setAttribute("role", "alert");
        else existing.removeAttribute("role");
      }
      return;
    }
    existing?.remove();
    const marker = createLabel(risky, label);
    anchor.after(marker);
    inlineWarnings.set(anchor, marker);
  }

  function lookUpRoots(hosts) {
    if (!hosts.length) return Promise.resolve();
    return messenger.runtime.sendMessage({ type: "link-guard-roots", hosts }).then(pairs => {
      const answered = new Map(Array.isArray(pairs) ? pairs.filter(Array.isArray) : []);
      for (const host of hosts) {
        const root = answered.get(host);
        registrableRoots.set(host, typeof root === "string" ? root : null);
      }
    }).catch(() => {
      // Without an answer every named domain counts as real and different from the
      // destination: the link warns instead of passing unchecked.
      for (const host of hosts) registrableRoots.set(host, host);
    });
  }

  function analyzeUnknown(hosts) {
    if (analysisPending || !stateReady) return;
    const roots = [...unknownRoots].filter(host => !registrableRoots.has(host)).slice(0, 500);
    unknownRoots.clear();
    if (!hosts.length && !roots.length) return;
    analysisPending = true;
    const analysis = !hosts.length ? Promise.resolve() :
      messenger.runtime.sendMessage({ type: "link-guard-analyze", hosts }).then(result => {
        for (const host of hosts) {
          analyzedHosts.set(host, result?.[host] || { kind: "unverified", similarTo: "" });
        }
      }).catch(() => {
        for (const host of hosts) analyzedHosts.set(host, { kind: "unverified", similarTo: "" });
      });
    Promise.all([analysis, lookUpRoots(roots)])
      .finally(() => { analysisPending = false; scan(); });
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
    const scopes = linkScopes();
    const anchors = [];
    for (const scope of scopes) {
      hideLinkElements(scope);
      for (const element of scope.querySelectorAll(CANDIDATES)) {
        if (isLinkCandidate(element)) anchors.push(element);
      }
    }
    const base = document.baseURI;
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
      if (inspected >= MAX_LISTED_LINKS) {
        // Past the limit every web link stays closed anyway, so only the cheap
        // classification runs: no rule matching, no analysis, no inline labels. This
        // keeps the work per scan bounded by the limit rather than by the message.
        if (policy.inspectLink(href, "", base).kind === "skip") continue;
        inspected++;
        markInline(anchor, null, []);
        if (hasHref(anchor)) stripHref(anchor);
        blocked++;
        continue;
      }
      const inspection = inspectAnchor(anchor, href, budget);
      if (inspection.kind === "skip") continue;
      if (inspection.kind === "web") {
        for (const host of inspection.hosts) {
          if (!policy.isIpAddress(host) && !analyzedHosts.has(host)) unknown.add(host);
        }
      }
      inspected++;
      const approved = isAllowed(inspection);
      const warning = inspection.kind === "web" ?
        inspection.hosts.map(warningFor).find(value => value && value.kind !== "none") : null;
      markInline(anchor, warning, inspection.risks || [], inspection.host);
      if (approved) restoreHref(anchor, href);
      else if (hasHref(anchor)) stripHref(anchor);
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
    // Shadow trees found by the first scan are observed from the next one on.
    observer.observe(document.body, OBSERVE);
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
