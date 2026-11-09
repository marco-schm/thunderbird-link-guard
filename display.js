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
  // The notice lists at most this many links per host; the count still covers all.
  const MAX_DETAILS_PER_HOST = 50;
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

  // Destinations whose lookalike and approval analysis is still missing; scan() adds them
  // to its analysis request.
  const destinationsToAnalyze = new Set();

  // true or false once known, undefined while the destination still needs analysis.
  function destinationApproved(host) {
    if (access.isBlocked(host, state)) return false;
    if (temporaryHosts.has(host)) return true;
    if (policy.isIpAddress(host)) return false;
    if (access.isExactlyApproved(host, state)) return true;
    if (!analyzedHosts.has(host)) return undefined;
    const status = statusFor(host);
    return status === "permanent" || status === "broad";
  }

  // A link that carries another destination (a redirector, a Safe Links or URL Defense
  // wrapper, an open redirect) warns only when that destination leaves the link's own
  // site and is not approved. The warning names the destination. Returns the risks and
  // whether a check is still pending, in which case the link stays closed for now.
  //
  // A carried destination is only a claim: the linked site decides where the browser
  // really goes. When an approved site is named inside a link whose own host is not
  // approved, the link would otherwise look harmless, so it gets a note (not a warning:
  // newsletter click trackers name the real site all the time).
  function redirectRisks(inspection) {
    const result = { risks: [], notes: [], pending: false };
    if (inspection.kind !== "web" || !inspection.destinations) return result;
    for (const target of inspection.destinations) {
      const approved = destinationApproved(target);
      if (approved === true) {
        if (destinationApproved(inspection.host) === true) continue;
        if (!registrableRoots.has(target) || !registrableRoots.has(inspection.host)) {
          unknownRoots.add(target);
          unknownRoots.add(inspection.host);
          continue;
        }
        const targetRoot = registrableRoots.get(target);
        if (!targetRoot || targetRoot !== registrableRoots.get(inspection.host)) {
          result.notes.push(`namedTarget:${target}`);
        }
        continue;
      }
      if (warningSettings.disabled.has("redirect")) continue;
      if (!registrableRoots.has(target) || !registrableRoots.has(inspection.host)) {
        unknownRoots.add(target);
        unknownRoots.add(inspection.host);
        result.pending = true;
        continue;
      }
      const targetRoot = registrableRoots.get(target);
      if (targetRoot && targetRoot === registrableRoots.get(inspection.host)) continue;
      if (approved === undefined) {
        destinationsToAnalyze.add(target);
        result.pending = true;
        continue;
      }
      result.risks.push(`redirect:${target}`);
    }
    return result;
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
    const redirect = redirectRisks(inspection);
    if (redirect.risks.length) {
      inspection = { ...inspection, risks: [...(inspection.risks || []), ...redirect.risks] };
    }
    if (redirect.notes.length) inspection = { ...inspection, notes: redirect.notes };
    if (warningRules) {
      // Rules are matched against the destination a click would open, not the raw
      // attribute, so a base-relative link cannot slip past a rule written for its URL.
      const target = policy.resolveHref(href, base)?.href || href;
      inspection = warningRules.applyWarnings(inspection, { disabled: warningSettings.disabled,
        evaluator: warningSettings.evaluator, href: target, text, budget });
    }
    // Until the link text and any carried destination are checked, the link stays closed,
    // whatever its host's approval.
    return bare === "pending" || redirect.pending ? { ...inspection, pendingCheck: true } : inspection;
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
    if (reason.startsWith("redirect:")) {
      return t(inline ? "riskInline_redirect" : "risk_redirect", [reason.slice(9)]);
    }
    return t(`${inline ? "riskInline" : "risk"}_${reason}`);
  }

  function isAllowed(inspection) {
    if (inspection.pendingCheck) return false;
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

  // Same order as access.js, and the same indexed lookups: a block wins, also over an
  // approval for this message.
  function statusFor(host) {
    if (access.isBlocked(host, state)) return "blocked";
    if (temporaryHosts.has(host)) return "temporary";
    if (access.isExactlyApproved(host, state)) return "permanent";
    const warning = warningFor(host);
    if (!warning || warning.kind !== "none") return "pending";
    if (access.isListApproved(host, state)) return "permanent";
    if (access.isBroadlyApproved(host, state)) return "broad";
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

  function ownBlockFor(host) {
    return access.ownBlockFor(host, state);
  }

  function confirmUnblock(host, own, actions) {
    const chooser = document.createElement("div");
    chooser.className = "link-guard-risk-confirm";
    const question = document.createElement("strong");
    question.textContent = own.scope === "domain" ?
      t("unblockDomainConfirm", [own.name]) : t("unblockConfirm", [host]);
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = t("unblockHost");
    confirm.addEventListener("click", () => decide(host, "unblock", own.scope));
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = t("cancelPreview");
    cancel.addEventListener("click", () => scan());
    chooser.append(question, confirm, cancel);
    actions.replaceChildren(chooser);
  }

  // A blocked host offers a single action: "Unblock", after a confirmation, when the block
  // is the user's own; a way to Settings when an imported list blocks it, since only the
  // list can change that. Once unblocked, the row shows the usual actions again.
  function blockedActions(host, actions) {
    const own = ownBlockFor(host);
    if (!own) {
      const note = document.createElement("p");
      note.className = "link-guard-blocked-note";
      note.textContent = t("blockedByList");
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = t("openSettings");
      open.addEventListener("click", () => {
        messenger.runtime.sendMessage({ type: "link-guard-open-settings" }).catch(() => {});
      });
      actions.append(note, open);
      return;
    }
    const unblock = document.createElement("button");
    unblock.type = "button";
    unblock.textContent = t("unblockHost");
    unblock.disabled = !stateReady;
    unblock.addEventListener("click", () => confirmUnblock(host, own, actions));
    actions.append(unblock);
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

  // A warning in the notice: red text behind a red warning triangle. The triangle is an
  // inline SVG rather than the ⚠ character, which some systems draw as a colour emoji.
  const SVG_NS = "http://www.w3.org/2000/svg";

  function warningIcon() {
    const icon = document.createElementNS(SVG_NS, "svg");
    icon.setAttribute("class", "link-guard-risk-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const triangle = document.createElementNS(SVG_NS, "path");
    triangle.setAttribute("d", "M10.3 3.9a2 2 0 0 1 3.4 0l8.4 14.6a2 2 0 0 1-1.7 3H3.6a2 2 0 0 1-1.7-3z");
    triangle.setAttribute("fill", "currentColor");
    const bar = document.createElementNS(SVG_NS, "path");
    bar.setAttribute("d", "M12 9v5.2");
    bar.setAttribute("class", "lg-icon-mark");
    bar.setAttribute("stroke", "#fff");
    bar.setAttribute("stroke-width", "2.4");
    bar.setAttribute("stroke-linecap", "round");
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", "12");
    dot.setAttribute("cy", "17.6");
    dot.setAttribute("r", "1.4");
    dot.setAttribute("class", "lg-icon-dot");
    dot.setAttribute("fill", "#fff");
    icon.append(triangle, bar, dot);
    return icon;
  }

  // The line takes the full width so each warning starts on its own line; the red box
  // inside it is only as wide as its text.
  function riskLine(text) {
    const line = document.createElement("div");
    line.className = "link-guard-risk";
    const box = document.createElement("span");
    box.className = "link-guard-risk-box";
    const label = document.createElement("span");
    label.textContent = text;
    box.append(warningIcon(), label);
    line.append(box);
    return line;
  }

  // A hint that is not a warning: amber text behind an information mark.
  function noteLine(text) {
    const line = document.createElement("div");
    line.className = "link-guard-risk link-guard-note";
    const box = document.createElement("span");
    box.className = "link-guard-risk-box";
    const label = document.createElement("span");
    label.textContent = text;
    const icon = document.createElementNS(SVG_NS, "svg");
    icon.setAttribute("class", "link-guard-risk-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");
    circle.setAttribute("fill", "currentColor");
    const mark = document.createElementNS(SVG_NS, "path");
    mark.setAttribute("d", "M12 11v6M12 7.2v.1");
    mark.setAttribute("class", "lg-icon-mark");
    mark.setAttribute("stroke", "#fff");
    mark.setAttribute("stroke-width", "2.4");
    mark.setAttribute("stroke-linecap", "round");
    icon.append(circle, mark);
    box.append(icon, label);
    line.append(box);
    return line;
  }

  // ----- The notice ------------------------------------------------------------------
  // Layout: a summary bar, then the destinations grouped
  // into "needs attention", "not yet approved", "blocked" and "approved", one card per
  // host with its warnings, its actions, a "⋯" menu for whole-domain decisions and the
  // list of its links. The look follows Thunderbird (see panel-style.js).

  // Per-message interface state, kept across rescans.
  const expandedHosts = new Set();
  const menuHosts = new Set();
  let approvedOpen = false;
  let panelShadow = null;

  function svgIcon(className, parts) {
    const icon = document.createElementNS(SVG_NS, "svg");
    icon.setAttribute("class", className);
    icon.setAttribute("viewBox", "0 0 20 20");
    icon.setAttribute("aria-hidden", "true");
    for (const [tag, attributes] of parts) {
      const part = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attributes)) part.setAttribute(name, value);
      icon.append(part);
    }
    return icon;
  }

  const ICON_PARTS = {
    globe: [["circle", { cx: "10", cy: "10", r: "7.25" }],
      ["path", { d: "M2.75 10h14.5M10 2.75c-2.5 2.4-2.5 12.1 0 14.5 2.5-2.4 2.5-12.1 0-14.5" }]],
    blocked: [["circle", { cx: "10", cy: "10", r: "7.25" }], ["path", { d: "m4.9 4.9 10.2 10.2" }]],
    check: [["circle", { cx: "10", cy: "10", r: "7.25" }], ["path", { d: "m6.8 10.2 2.1 2.1 4.3-4.5" }]],
    more: [["path", { d: "M5 10h.01M10 10h.01M15 10h.01", "stroke-width": "2.6" }]],
    chevron: [["path", { d: "m8 5 5 5-5 5" }]],
    shield: [["path", { d: "M10 2.5 16 4.8v4.8c0 3.6-2.5 6.5-6 7.9-3.5-1.4-6-4.3-6-7.9V4.8Z" }]],
    target: [["circle", { cx: "10", cy: "10", r: "6.5" }], ["circle", { cx: "10", cy: "10", r: "2" }]]
  };

  function icon(name, className = "lg-icon") {
    return svgIcon(className, ICON_PARTS[name]);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function actionButton(label, onClick, { kind = "", key = "", disabled = !stateReady } = {}) {
    const control = element("button", kind ? `lg-btn lg-btn-${kind}` : "lg-btn", label);
    control.type = "button";
    control.disabled = disabled;
    if (key) control.dataset.key = key;
    control.addEventListener("click", onClick);
    return control;
  }

  // The registrable domain in bold, so "login.example.org.evil.example" reads as what it is.
  function hostName(host) {
    const name = element("span", "lg-host-name");
    const root = registrableRoots.get(host);
    if (root && host !== root && host.endsWith(`.${root}`)) {
      name.append(host.slice(0, host.length - root.length), element("strong", "", root));
    } else name.append(element("strong", "", host));
    return name;
  }

  function badge(statusKey, risky) {
    const tone = statusKey === "blocked" ? "danger" : statusKey === "pending" ? (risky ? "danger" : "warning") :
      statusKey === "temporary" ? "info" : "success";
    return element("span", `lg-badge lg-badge-${tone}`, t(`status_${statusKey}`));
  }

  // Same rule as access.js: a host with a risk needs its exact approval, and short links
  // and code in links only an approval for this message.
  function hostStatus(host, risks) {
    const temporaryOnly = risks?.has("shortLink") || risks?.has("scriptInUrl");
    const status = statusFor(host);
    if (status === "blocked") return { statusKey: "blocked", temporaryOnly };
    if (temporaryOnly && !temporaryHosts.has(host)) return { statusKey: "pending", temporaryOnly };
    if (risks?.size && !temporaryHosts.has(host) && !access.isExactlyApproved(host, state)) {
      return { statusKey: "pending", temporaryOnly };
    }
    return { statusKey: status, temporaryOnly };
  }

  function warningLines(host, risks, notes) {
    const lines = [];
    const warning = warningFor(host);
    if (warning && warning.kind !== "none") {
      lines.push(riskLine(warning.kind === "idn" ? t("riskIdn") :
        warning.kind === "unverified" ? t("riskUnverified") : t("riskLookalike", [warning.similarTo])));
    }
    for (const reason of risks || []) lines.push(riskLine(riskText(reason, false)));
    for (const note of notes || []) {
      if (note.startsWith("namedTarget:")) lines.push(noteLine(t("note_namedTarget", [note.slice(12), host])));
    }
    return lines;
  }

  // The "⋯" menu: whole-domain decisions and the actions that are not offered directly.
  function menuItems(host, statusKey, temporaryOnly, risks) {
    const items = [];
    const root = registrableRoots.get(host);
    if (policy.isIpAddress(host) || statusKey === "blocked") return items;
    if (statusKey === "temporary" || statusKey === "permanent" || statusKey === "broad") {
      if (statusKey === "temporary" && !temporaryOnly) {
        items.push(actionButton(t("allowPermanent"), () => decide(host, "permanent"), { kind: "menu", key: `perm:${host}` }));
      }
      if (statusKey !== "broad") {
        items.push(actionButton(t("blockHost"), () => decide(host, "block"), { kind: "menu", key: `block:${host}` }));
      }
    }
    const warning = warningFor(host);
    // A whole-domain approval would not open a link with a warning, so it is not offered.
    if (root && statusKey === "pending" && !risks?.size && (!warning || warning.kind === "none") &&
        !policy.isSharedContentHost(host)) {
      items.push(actionButton(t("allowDomain", [root]), () => decide(host, "permanent", "domain"),
        { kind: "menu", key: `permd:${host}` }));
    }
    if (root) {
      items.push(actionButton(t("blockDomain", [root]), () => decide(host, "block", "domain"),
        { kind: "menu", key: `blockd:${host}` }));
    }
    return items;
  }

  function primaryActions(host, statusKey, temporaryOnly, risky, risks, actions) {
    if (statusKey === "blocked") {
      blockedActions(host, actions);
      return;
    }
    if (statusKey !== "pending") return;
    const ip = policy.isIpAddress(host);
    if (!ip && !temporaryOnly) {
      actions.append(actionButton(t("allowPermanent"), () => decide(host, "permanent"),
        { kind: risky ? "" : "primary", key: `perm:${host}` }));
    }
    // A short link hides its destination, so allowing it asks once more.
    actions.append(actionButton(t("allowTemporary"), () => risks?.has("shortLink") ?
      riskyApproval(host, actions) : decide(host, "temporary"), { key: `temp:${host}` }));
    if (!ip) {
      actions.append(actionButton(t("blockHost"), () => decide(host, "block"),
        { kind: "subtle-danger", key: `block:${host}` }));
    }
  }

  function linkList(host, details) {
    const list = element("ul", "lg-links");
    details.forEach((detail, index) => {
      const item = element("li", "lg-link");
      item.append(element("p", detail.text ? "lg-link-text" : "lg-link-text lg-empty",
        detail.text || t("noLinkText")));
      item.append(element("p", "lg-link-url", detail.url));
      const show = actionButton(t("showInMessage"), () => showInMessage(detail.anchor),
        { kind: "small", key: `show:${host}:${index}`, disabled: !detail.anchor.isConnected });
      show.prepend(icon("target", "lg-icon lg-icon-small"));
      item.append(show);
      list.append(item);
    });
    return list;
  }

  // Scrolls the message to a link and outlines it for a moment.
  function showInMessage(anchor) {
    if (!anchor?.isConnected) return;
    anchor.scrollIntoView({ block: "center", behavior: "smooth" });
    const previous = [anchor.style.getPropertyValue("outline"), anchor.style.getPropertyPriority("outline")];
    anchor.style.setProperty("outline", "3px solid #1373d9", "important");
    setTimeout(() => {
      if (previous[0]) anchor.style.setProperty("outline", previous[0], previous[1]);
      else anchor.style.removeProperty("outline");
    }, 1800);
  }

  function linksToggle(host, details, defaultOpen) {
    const open = expandedHosts.has(host) !== defaultOpen;
    const toggle = element("button", "lg-toggle");
    toggle.type = "button";
    toggle.dataset.key = `links:${host}`;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.append(icon("chevron", "lg-icon lg-icon-small lg-chevron"),
      open ? t("hideLinks") : t("showLinks", [String(details.length)]));
    toggle.addEventListener("click", () => {
      if (expandedHosts.has(host)) expandedHosts.delete(host); else expandedHosts.add(host);
      scan();
    });
    return open ? [toggle, linkList(host, details)] : [toggle];
  }

  function moreButton(host, items) {
    if (!items.length) return null;
    const open = menuHosts.has(host);
    const more = element("button", "lg-icon-btn");
    more.type = "button";
    more.dataset.key = `more:${host}`;
    more.setAttribute("aria-label", t("moreActions", [host]));
    more.title = t("moreActions", [host]);
    more.setAttribute("aria-expanded", String(open));
    more.append(icon("more"));
    more.addEventListener("click", () => {
      if (open) menuHosts.delete(host); else menuHosts.add(host);
      scan();
    });
    return more;
  }

  function hostCard(host, risks, notes, details) {
    const { statusKey, temporaryOnly } = hostStatus(host, risks);
    const lines = warningLines(host, risks, notes);
    const risky = lines.some(line => !line.classList.contains("link-guard-note"));
    const card = element("article", "lg-card");
    if (risky && statusKey !== "blocked") card.classList.add("lg-card-risk");
    if (statusKey === "blocked") card.classList.add("lg-card-blocked");
    const items = menuItems(host, statusKey, temporaryOnly, risks);
    const head = element("div", "lg-card-head");
    head.append(icon(statusKey === "blocked" ? "blocked" : "globe", "lg-icon lg-host-icon"), hostName(host),
      badge(statusKey, risky));
    const more = moreButton(host, items);
    if (more) head.append(more);
    card.append(head, ...lines);
    const actions = element("div", "lg-actions");
    // A warning or a hint takes the emphasis off "Allow permanently".
    primaryActions(host, statusKey, temporaryOnly, lines.length > 0, risks, actions);
    if (actions.childElementCount) card.append(actions);
    if (more && menuHosts.has(host)) {
      const menu = element("div", "lg-menu");
      menu.append(...items);
      card.append(menu);
    }
    if (details.length) card.append(...linksToggle(host, details, risky && statusKey !== "blocked"));
    return card;
  }

  // Approved hosts take one line each; their links and actions open on demand.
  function approvedList(hosts, linkRisks, linkNotes, linkDetails) {
    const card = element("div", "lg-card lg-compact");
    for (const host of hosts) {
      const risks = linkRisks.get(host);
      const { statusKey, temporaryOnly } = hostStatus(host, risks);
      const row = element("div", "lg-compact-row");
      row.append(icon("check", "lg-icon lg-host-icon lg-ok"), hostName(host), badge(statusKey, false));
      const items = menuItems(host, statusKey, temporaryOnly, risks);
      const more = moreButton(host, items);
      if (more) row.append(more);
      card.append(row);
      const lines = warningLines(host, risks, linkNotes.get(host));
      if (lines.length) {
        const box = element("div", "lg-compact-detail");
        box.append(...lines);
        card.append(box);
      }
      if (more && menuHosts.has(host)) {
        const menu = element("div", "lg-menu lg-compact-detail");
        menu.append(...items);
        card.append(menu);
      }
      const details = linkDetails.get(host) || [];
      if (details.length) {
        const box = element("div", "lg-compact-detail");
        box.append(...linksToggle(host, details, false));
        card.append(box);
      }
    }
    return card;
  }

  function section(title, count, ...content) {
    const block = element("section", "lg-section");
    const heading = element("h3", "lg-section-title", title);
    heading.append(element("span", "lg-count", String(count)));
    block.append(heading, ...content);
    return block;
  }

  // Counts without plural forms, so every language reads naturally.
  function countLine(totalWeb, pending, blocked, warnings) {
    return [warnings ? t("countWarnings", [String(warnings)]) : "",
      pending ? t("countPending", [String(pending)]) : "",
      blocked ? t("countBlocked", [String(blocked)]) : "",
      t("countLinks", [String(totalWeb)])].filter(Boolean).join(" · ");
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
    panelShadow = panelHost.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = globalThis.LinkGuardPanelCss || "";
    panel = document.createElement("details");
    panel.className = "link-guard-panel";
    panel.lang = panelLanguage;
    panel.tabIndex = -1;
    panelShadow.append(style, panel);
    document.body.prepend(panelHost);
  }

  function renderPanel(groups, hardBlocks, linkRisks, totalWeb, pending, blocked, warnings, overflow,
      linkNotes = new Map(), linkDetails = new Map()) {
    if (!document.body) return;
    if (!state.enabled || (pending + blocked + warnings === 0 && !overflow)) {
      panelHost?.remove();
      panelHost = null;
      panel = null;
      panelShadow = null;
      return;
    }
    if (!panel || !panelHost?.isConnected) createPanel();
    const focusKey = panelShadow?.activeElement?.dataset?.key;
    const tone = warnings || hardBlocks.size ? "danger" : blocked ? "blocked" : "pending";
    panel.dataset.tone = tone;

    const summary = element("summary", "lg-summary");
    const text = element("span", "lg-summary-text");
    text.append(element("span", "lg-summary-title",
      t(tone === "danger" ? "panelTitleDanger" : tone === "blocked" ? "panelTitleBlocked" : "panelTitlePending")),
    element("span", "lg-summary-counts", countLine(totalWeb, pending, blocked, warnings)));
    summary.append(icon("shield", "lg-icon lg-summary-icon"), text, icon("chevron", "lg-icon lg-summary-chevron"));

    const attention = [];
    const waiting = [];
    const blockedHosts = [];
    const approved = [];
    for (const host of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
      const risks = linkRisks.get(host);
      const { statusKey } = hostStatus(host, risks);
      const warning = warningFor(host);
      const risky = Boolean(risks?.size || (warning && warning.kind !== "none"));
      if (statusKey === "blocked") blockedHosts.push(host);
      else if (statusKey === "pending" && risky) attention.push(host);
      else if (statusKey === "pending" || statusKey === "temporary") waiting.push(host);
      else approved.push(host);
    }
    const card = host => hostCard(host, linkRisks.get(host), linkNotes.get(host), linkDetails.get(host) || []);
    const body = element("div", "lg-body");
    if (attention.length) body.append(section(t("sectionAttention"), attention.length, ...attention.map(card)));
    if (hardBlocks.size) {
      const items = [];
      for (const [key, count] of hardBlocks) {
        const [reason, host] = key.split("|", 2);
        const item = element("article", "lg-card lg-card-risk");
        item.append(riskLine(`${host || t("unknownHost")}: ${t(`reason_${reason}`)} (${count})`));
        items.push(item);
      }
      body.append(section(t("unsafeTitle"), hardBlocks.size, ...items));
    }
    if (waiting.length) body.append(section(t("sectionPending"), waiting.length, ...waiting.map(card)));
    if (blockedHosts.length) body.append(section(t("sectionBlocked"), blockedHosts.length, ...blockedHosts.map(card)));
    if (approved.length) {
      const toggle = element("button", "lg-toggle lg-section-toggle");
      toggle.type = "button";
      toggle.dataset.key = "approved";
      toggle.setAttribute("aria-expanded", String(approvedOpen));
      toggle.append(icon("chevron", "lg-icon lg-icon-small lg-chevron"), t("sectionApproved"),
        element("span", "lg-count", String(approved.length)));
      toggle.addEventListener("click", () => { approvedOpen = !approvedOpen; scan(); });
      const block = element("section", "lg-section");
      block.append(toggle);
      if (approvedOpen) block.append(approvedList(approved, linkRisks, linkNotes, linkDetails));
      body.append(block);
    }
    if (overflow) body.append(element("p", "lg-footnote", t("overflowNotice")));
    if (!stateReady || errorKey) body.append(element("p", "lg-error", t(errorKey || "stateUnavailable")));
    panel.replaceChildren(summary, body);
    if (focusKey) {
      [...panel.querySelectorAll("[data-key]")].find(node => node.dataset.key === focusKey)?.focus();
    }
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
    warning: [["margin", "2px 4px"], ["padding", "2px 7px"], ["border", "1px solid #b91c1c"],
      ["border-radius", "4px"], ["background", "#b91c1c"], ["color", "#fff"],
      ["font", "600 12px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif"]],
    destination: [["margin", "2px 4px"], ["padding", "1px 5px"], ["border", "1px solid #d4d4d8"],
      ["border-radius", "4px"], ["background", "#f4f4f5"], ["color", "#3f3f46"],
      ["font", "500 11px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif"]]
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
    // A line may break only between two parts, never right after a ⚠ or ↗ sign, so
    // each warning stays together when a long label wraps.
    const label = [hostLabel, ...(risks || []).map(reason => riskText(reason, true)),
      showHost ? t("linkDestinationInline", [host]) : ""]
      .filter(Boolean).map(part => part.replace(/^([\u26a0\u2197])\s+/u, "$1\u00a0"))
      .join("\u00a0\u00b7 ");
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
    const linkNotes = new Map();
    const linkDetails = new Map();
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
      // Every listed host shows its registrable domain in bold, so it is looked up.
      if (!registrableRoots.has(inspection.host) && !policy.isIpAddress(inspection.host)) {
        unknownRoots.add(inspection.host);
      }
      const details = linkDetails.get(inspection.host) || [];
      if (details.length < MAX_DETAILS_PER_HOST) {
        details.push({ anchor, text: (anchor.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200),
          url: (policy.resolveHref(href, base)?.href || href).slice(0, 2048) });
        linkDetails.set(inspection.host, details);
      }
      if (warning || inspection.risks?.length) warnings++;
      for (const host of inspection.hosts) groups.set(host, (groups.get(host) || 0) + 1);
      if (inspection.risks?.length) {
        for (const host of inspection.hosts) {
          const risks = linkRisks.get(host) || new Set();
          for (const risk of inspection.risks) risks.add(risk);
          linkRisks.set(host, risks);
        }
      }
      if (inspection.notes?.length) {
        const notes = linkNotes.get(inspection.host) || new Set();
        for (const note of inspection.notes) notes.add(note);
        linkNotes.set(inspection.host, notes);
      }
      if (!approved) {
        if (inspection.hosts.some(host => statusFor(host) === "blocked")) blocked++;
        else pending++;
      }
    }
    const overflow = inspected > MAX_LISTED_LINKS;
    renderPanel(groups, hardBlocks, linkRisks, totalWeb, pending, blocked, warnings, overflow, linkNotes,
      linkDetails);
    sendToolbar(pending, blocked, warnings, overflow);
    for (const host of destinationsToAnalyze) {
      if (!analyzedHosts.has(host)) unknown.add(host);
    }
    destinationsToAnalyze.clear();
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
