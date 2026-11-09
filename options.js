"use strict";

const policy = globalThis.LinkGuardPolicy;
const listImport = globalThis.LinkGuardImport;
const warnings = globalThis.LinkGuardWarnings;
const builtinInputs = new Map();
const warningListViews = new Map();
const t = globalThis.LinkGuardLocale.getMessage;
const importedInputs = new Map();
const enabledInput = document.getElementById("enabled");
const destinationsInput = document.getElementById("showDestinations");
const customInput = document.getElementById("customHosts");
const blockedInput = document.getElementById("blockedHosts");
const broadInput = document.getElementById("broadDomains");
const blockedDomainsInput = document.getElementById("blockedDomains");
const status = document.getElementById("status");
const storedKeys = { enabled: true, showDestinations: true, customAllowedHosts: [], blockedHosts: [],
  blockedDomains: [], broadAllowedDomains: [], importedLists: [],
  disabledWarnings: [], customWarnings: [], warningLists: [] };
let baseline = "";
let dirty = false;
let saving = false;
let pendingImport = null;

function snapshot(value) {
  return JSON.stringify(Object.fromEntries(Object.keys(storedKeys).map(key => [key, value[key]])));
}

document.documentElement.lang = globalThis.LinkGuardLocale.effectiveUiLocale(
  messenger.i18n.getUILanguage());
document.title = t("settingsTitle");
for (const element of document.querySelectorAll("[data-i18n]")) {
  element.textContent = t(element.dataset.i18n);
}

function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

// Host lists and warning lists have different size limits, so the message names the
// limit of the list that was rejected.
function tooLarge(bytes) {
  return t("importTooLarge", [String(bytes / 1024)]);
}

function showImportError(error, fallback = "importFetch") {
  if (error?.message === "importTooLarge") {
    showStatus(tooLarge(listImport.MAX_BYTES), true);
    return;
  }
  const known = new Set(["importFormat", "importDuplicate", "importUrl", "importFetch"]);
  showStatus(t(known.has(error?.message) ? error.message : fallback), true);
}

const OWN_RULE_LIMIT = 500;

function limitReason(limit) {
  return t("hostLimit", [limit.toLocaleString(document.documentElement.lang)]);
}

function readHosts(input, label, limit = OWN_RULE_LIMIT) {
  const result = policy.parseHostList(input.value, limit);
  if (result.errors.length) {
    const issue = result.errors[0];
    const reason = issue === "limit" ? limitReason(limit) : t("invalidHostLine", [String(issue)]);
    throw new Error(`${label}: ${reason}`);
  }
  return result.hosts;
}

function readRules(input, label, wholeDomainOnly = false, limit = OWN_RULE_LIMIT) {
  const result = policy.parseRuleList(input.value, wholeDomainOnly, limit);
  if (result.errors.length) {
    const issue = result.errors[0];
    const reason = issue === "limit" ? limitReason(limit) : t("invalidHostLine", [String(issue)]);
    throw new Error(`${label}: ${reason}`);
  }
  return result;
}

function formatRuleList(hosts, domains) {
  return [...hosts, ...domains.map(domain => `*.${domain}`)].sort().join("\n");
}

function listSummary(item, count) {
  return `${t(`kind_${item.kind || "allow"}`)} · ${t(`category_${item.category}`)} · ${t("hostCount", [String(count)])}`;
}

function refreshOutcome(item) {
  if (!item.refreshStatus) return "";
  const date = item.refreshedAt ?
    new Date(item.refreshedAt).toLocaleString(document.documentElement.lang) : "";
  if (item.refreshStatus === "kindChanged") return t("autoRefreshKind");
  if (item.refreshStatus === "review") return t("autoRefreshReview");
  return t(item.refreshStatus === "ok" ? "autoRefreshOk" : "autoRefreshFailed", [date]);
}

// Block lists may hold `*.example.org` entries; allow lists hold exact hosts only.
function readListEntries(view) {
  if (view.item.kind !== "block") return readHosts(view.textarea, view.item.name, listImport.MAX_HOSTS);
  const rules = readRules(view.textarea, view.item.name, false, listImport.MAX_HOSTS);
  return [...rules.hosts, ...rules.domains.map(domain => `*.${domain}`)].sort();
}

function createImported(item) {
  const card = document.createElement("article");
  card.className = "card imported-card";
  const top = document.createElement("div");
  top.className = "imported-top";
  const heading = document.createElement("div");
  const name = document.createElement("div");
  name.className = "imported-name";
  name.textContent = item.name;
  const count = document.createElement("div");
  count.className = "imported-count";
  count.textContent = listSummary(item, item.hosts.length);
  heading.append(name, count);
  const toggle = document.createElement("label");
  toggle.className = "imported-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.enabled;
  const toggleText = document.createElement("span");
  toggleText.textContent = t("importedEnable");
  toggle.append(checkbox, toggleText);
  top.append(heading, toggle);
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = t("listViewEdit");
  const textarea = document.createElement("textarea");
  textarea.rows = 5;
  textarea.spellcheck = false;
  textarea.value = item.hosts.join("\n");
  textarea.setAttribute("aria-label",
    `${item.name}: ${t(item.kind === "block" ? "listBlockedHosts" : "listHosts")}`);
  textarea.addEventListener("input", () => {
    count.textContent = listSummary(item, textarea.value.split(/\r?\n/).filter(x => x.trim()).length);
  });
  details.append(summary, textarea);
  if (item.sourceUrl) {
    const source = document.createElement("p");
    source.className = "import-source";
    source.textContent = item.sourceUrl;
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "imported-action";
    refresh.textContent = t("refreshPreview");
    refresh.addEventListener("click", async () => {
      try {
        showStatus(t("importLoading"));
        const replacement = await listImport.fetchRemote(item.sourceUrl);
        showPreview(replacement, item.id);
        showStatus(t("importReady"));
      } catch (error) { showImportError(error); }
    });
    details.append(source, refresh);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "imported-action";
  remove.textContent = t("removeList");
  remove.addEventListener("click", () => {
    importedInputs.delete(item.id);
    card.remove();
    dirty = true;
  });
  details.append(remove);
  card.append(top);
  // Only remote blocklists can update themselves; allowlists never do.
  let auto = null;
  if (item.kind === "block" && item.sourceUrl) {
    const autoRow = document.createElement("label");
    autoRow.className = "imported-toggle";
    auto = document.createElement("input");
    auto.type = "checkbox";
    auto.checked = item.autoRefresh !== false;
    const autoText = document.createElement("span");
    autoText.textContent = t("autoRefreshLabel");
    autoRow.append(auto, autoText);
    card.append(autoRow);
    const outcome = refreshOutcome(item);
    if (outcome) {
      const note = document.createElement("p");
      note.className = "import-source";
      note.textContent = outcome;
      card.append(note);
    }
  }
  card.append(details);
  importedInputs.set(item.id, { item, checkbox, textarea, card, auto });
  return card;
}

function showPreview(item, replacingId = null) {
  pendingImport = { ...item, replacingId };
  const box = document.getElementById("importPreview");
  const title = document.createElement("h3");
  title.textContent = `${replacingId ? t("refreshTitle") : t("importPreviewTitle")}: ${item.name}`;
  const info = document.createElement("p");
  info.textContent = listSummary(item, item.hosts.length);
  const textarea = document.createElement("textarea");
  textarea.readOnly = true;
  textarea.rows = 8;
  textarea.value = item.hosts.join("\n");
  const apply = document.createElement("button");
  apply.type = "button";
  apply.textContent = replacingId ? t("stageRefresh") : t("stageImport");
  apply.addEventListener("click", () => {
    if (!pendingImport) return;
    if (!replacingId && importedInputs.size >= listImport.MAX_LISTS) {
      showStatus(t("importListLimit"), true);
      return;
    }
    const old = replacingId ? importedInputs.get(replacingId) : null;
    const id = replacingId || crypto.randomUUID();
    const next = { id, name: pendingImport.name, category: pendingImport.category,
      kind: pendingImport.kind, hosts: pendingImport.hosts, sourceUrl: pendingImport.sourceUrl || "",
      enabled: false, autoRefresh: old ? old.auto?.checked === true : true,
      refreshedAt: pendingImport.sourceUrl ? Date.now() : 0, refreshStatus: "" };
    const card = createImported(next);
    if (old) old.card.replaceWith(card);
    else document.getElementById("importedLists").append(card);
    pendingImport = null;
    box.hidden = true;
    dirty = true;
    showStatus(t("importStaged"));
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = t("cancelPreview");
  cancel.addEventListener("click", () => { pendingImport = null; box.hidden = true; });
  box.replaceChildren(title, info, textarea, apply, cancel);
  box.hidden = false;
}

// Errors whose message is already a translated sentence for the status line.
function userError(message) {
  const error = new Error(message);
  error.userFacing = true;
  return error;
}

// ----- Warnings -----------------------------------------------------------------

function renderBuiltinWarnings(disabled) {
  const box = document.getElementById("builtinWarnings");
  box.replaceChildren();
  builtinInputs.clear();
  for (const kind of warnings.BUILTIN) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !disabled.includes(kind);
    const text = document.createElement("span");
    text.textContent = t(`warn_${kind}`);
    label.append(input, text);
    box.append(label);
    builtinInputs.set(kind, input);
  }
}

function addRuleRow(rule = { label: "", target: "url", pattern: "" }) {
  const row = document.createElement("div");
  row.className = "rule-row";
  const label = document.createElement("input");
  label.type = "text";
  label.className = "rule-label";
  label.maxLength = 60;
  label.placeholder = t("ruleLabel");
  label.setAttribute("aria-label", t("ruleLabel"));
  label.value = rule.label;
  const target = document.createElement("select");
  target.className = "rule-target";
  target.setAttribute("aria-label", t("ruleTarget"));
  for (const value of warnings.TARGETS) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = t(`ruleTarget_${value}`);
    target.append(option);
  }
  target.value = rule.target;
  const pattern = document.createElement("input");
  pattern.type = "text";
  pattern.className = "rule-pattern";
  pattern.maxLength = 200;
  pattern.spellcheck = false;
  pattern.autocomplete = "off";
  pattern.placeholder = t("rulePattern");
  pattern.setAttribute("aria-label", t("rulePattern"));
  pattern.value = rule.pattern;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "imported-action";
  remove.textContent = t("removeRule");
  remove.addEventListener("click", () => { row.remove(); dirty = true; });
  row.append(label, target, pattern, remove);
  document.getElementById("customRules").append(row);
  return row;
}

function readOwnRules() {
  const rows = [...document.querySelectorAll("#customRules .rule-row")];
  const raw = rows.map(row => ({ label: row.querySelector(".rule-label").value,
    target: row.querySelector(".rule-target").value, pattern: row.querySelector(".rule-pattern").value }))
    .filter(rule => rule.label.trim() || rule.pattern);
  if (raw.length > warnings.MAX_OWN_RULES) throw userError(t("warningRuleLimit"));
  return raw.map((rule, index) => {
    try { return warnings.parseRule(rule); }
    catch (error) { throw userError(t("ruleInvalid", [String(index + 1), t(error.message)])); }
  });
}

function ruleLines(rules) {
  const list = document.createElement("ul");
  list.className = "rule-lines";
  for (const rule of rules) {
    const item = document.createElement("li");
    const code = document.createElement("code");
    code.textContent = rule.pattern;
    item.append(`${rule.label} · ${t(`ruleTarget_${rule.target}`)} · `, code);
    list.append(item);
  }
  return list;
}

function showWarningError(error) {
  if (error?.rule) {
    showStatus(t("ruleInvalid", [String(error.rule), t(error.message)]), true);
    return;
  }
  if (error?.message === "importTooLarge") {
    showStatus(tooLarge(warnings.MAX_BYTES), true);
    return;
  }
  const known = new Set(["warningListFormat", "warningRuleLimit", "importUrl", "importFetch"]);
  showStatus(t(known.has(error?.message) ? error.message : "warningListFormat"), true);
}

function createWarningList(item) {
  const card = document.createElement("article");
  card.className = "card imported-card";
  const top = document.createElement("div");
  top.className = "imported-top";
  const heading = document.createElement("div");
  const name = document.createElement("div");
  name.className = "imported-name";
  name.textContent = item.name;
  const count = document.createElement("div");
  count.className = "imported-count";
  count.textContent = t("ruleCount", [String(item.rules.length)]);
  heading.append(name, count);
  const toggle = document.createElement("label");
  toggle.className = "imported-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.enabled;
  const toggleText = document.createElement("span");
  toggleText.textContent = t("importedEnable");
  toggle.append(checkbox, toggleText);
  top.append(heading, toggle);
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = t("showRules");
  details.append(summary, ruleLines(item.rules));
  if (item.sourceUrl) {
    const source = document.createElement("p");
    source.className = "import-source";
    source.textContent = item.sourceUrl;
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "imported-action";
    refresh.textContent = t("refreshPreview");
    refresh.addEventListener("click", async () => {
      try {
        showStatus(t("importLoading"));
        showWarningPreview(await warnings.fetchList(item.sourceUrl), item.id);
        showStatus(t("importReady"));
      } catch (error) { showWarningError(error); }
    });
    details.append(source, refresh);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "imported-action";
  remove.textContent = t("removeList");
  remove.addEventListener("click", () => {
    warningListViews.delete(item.id);
    card.remove();
    dirty = true;
  });
  details.append(remove);
  card.append(top, details);
  warningListViews.set(item.id, { item, checkbox, card });
  return card;
}

// A previewed list (new or refreshed) is staged disabled; it applies only once the
// user enables it and saves.
function showWarningPreview(list, replacingId = null) {
  const box = document.getElementById("warningPreview");
  const title = document.createElement("h3");
  title.textContent = `${replacingId ? t("refreshTitle") : t("warningListPreviewTitle")}: ${list.name}`;
  const info = document.createElement("p");
  info.textContent = t("ruleCount", [String(list.rules.length)]);
  const apply = document.createElement("button");
  apply.type = "button";
  apply.textContent = replacingId ? t("stageRefresh") : t("stageImport");
  apply.addEventListener("click", () => {
    if (!replacingId && warningListViews.size >= warnings.MAX_LISTS) {
      showStatus(t("warningListLimit"), true);
      return;
    }
    const id = replacingId || crypto.randomUUID();
    const card = createWarningList({ id, name: list.name, rules: list.rules,
      sourceUrl: list.sourceUrl || "", enabled: false });
    const old = replacingId ? warningListViews.get(replacingId) : null;
    if (old && old.card !== card) old.card.replaceWith(card);
    else document.getElementById("warningLists").append(card);
    box.hidden = true;
    dirty = true;
    showStatus(t("importStaged"));
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = t("cancelPreview");
  cancel.addEventListener("click", () => { box.hidden = true; });
  box.replaceChildren(title, info, ruleLines(list.rules), apply, cancel);
  box.hidden = false;
}

function readWarningLists() {
  return [...warningListViews.entries()].map(([id, view]) => ({ id, name: view.item.name,
    rules: view.item.rules, sourceUrl: view.item.sourceUrl || "", enabled: view.checkbox.checked }));
}

document.getElementById("addRule").addEventListener("click", () => {
  if (document.querySelectorAll("#customRules .rule-row").length >= warnings.MAX_OWN_RULES) {
    showStatus(t("warningRuleLimit"), true);
    return;
  }
  addRuleRow().querySelector(".rule-label").focus();
  dirty = true;
});

document.getElementById("warningFile").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > warnings.MAX_BYTES) throw new Error("importTooLarge");
    showWarningPreview(warnings.parseList(await file.text()));
    showStatus(t("importReady"));
  } catch (error) { showWarningError(error); }
});

document.getElementById("previewWarningList").addEventListener("click", async () => {
  try {
    showStatus(t("importLoading"));
    showWarningPreview(await warnings.fetchList(document.getElementById("warningUrl").value));
    showStatus(t("importReady"));
  } catch (error) { showWarningError(error); }
});

async function load() {
  try {
    const saved = await messenger.storage.local.get(storedKeys);
    baseline = snapshot(saved);
    enabledInput.checked = saved.enabled !== false;
    destinationsInput.checked = saved.showDestinations !== false;
    customInput.value = (saved.customAllowedHosts || []).join("\n");
    blockedInput.value = (saved.blockedHosts || []).join("\n");
    broadInput.value = formatRuleList([], saved.broadAllowedDomains || []);
    blockedDomainsInput.value = formatRuleList([], saved.blockedDomains || []);
    const imported = document.getElementById("importedLists");
    imported.replaceChildren();
    importedInputs.clear();
    for (const item of listImport.cleanStored(saved.importedLists)) {
      imported.append(createImported(item));
    }
    pendingImport = null;
    document.getElementById("importPreview").hidden = true;
    renderBuiltinWarnings(warnings.cleanDisabled(saved.disabledWarnings));
    document.getElementById("customRules").replaceChildren();
    for (const rule of warnings.cleanRules(saved.customWarnings)) addRuleRow(rule);
    const lists = document.getElementById("warningLists");
    lists.replaceChildren();
    warningListViews.clear();
    for (const item of warnings.cleanStoredLists(saved.warningLists)) lists.append(createWarningList(item));
    document.getElementById("warningPreview").hidden = true;
    dirty = false;
  } catch { showStatus(t("settingsLoadFailed"), true); }
}

document.addEventListener("input", event => {
  if (event.target.matches("textarea, input[type=checkbox], .rule-row input, .rule-row select")) dirty = true;
});

document.getElementById("importFile").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > listImport.MAX_BYTES) throw new Error("importTooLarge");
    showPreview(listImport.parse(await file.text()));
    showStatus(t("importReady"));
  } catch (error) { showImportError(error, "importFormat"); }
});

document.getElementById("previewRemote").addEventListener("click", async () => {
  try {
    showStatus(t("importLoading"));
    const item = await listImport.fetchRemote(document.getElementById("importUrl").value);
    showPreview(item);
    showStatus(t("importReady"));
  } catch (error) { showImportError(error); }
});
document.addEventListener("change", event => {
  if (event.target.matches("textarea, input[type=checkbox], .rule-row input, .rule-row select")) dirty = true;
});

messenger.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || saving ||
      !Object.keys(storedKeys).some(key => Object.hasOwn(changes, key))) return;
  if (dirty) showStatus(t("settingsChanged"), true);
  else load();
});

document.getElementById("save").addEventListener("click", async () => {
  try {
    const customAllowedHosts = readHosts(customInput, t("customTitle"));
    const blockedHosts = readHosts(blockedInput, t("blockedTitle"));
    const blockedDomains = readRules(blockedDomainsInput, t("blockedDomainsTitle"), true).domains;
    const broadAllowedDomains = readRules(broadInput, t("broadTitle"), true).domains;
    const importedLists = [];
    const importedWildcards = [];
    for (const [id, view] of importedInputs) {
      const hosts = readListEntries(view);
      if (!hosts.length) throw new Error(t("importEmpty"));
      const wildcards = hosts.filter(host => host.startsWith("*.")).map(host => host.slice(2));
      if (wildcards.length) importedWildcards.push([view.item.name, wildcards]);
      importedLists.push({ ...view.item, id, hosts, enabled: view.checkbox.checked,
        autoRefresh: view.auto ? view.auto.checked : false });
    }
    const invalidBroad = await messenger.runtime.sendMessage({
      type: "link-guard-validate-broad", hosts: [...broadAllowedDomains, ...blockedDomains]
    });
    if (invalidBroad) throw new Error(`${t("broadTitle")}: ${t("broadInvalid", [invalidBroad])}`);
    for (const [listName, domains] of importedWildcards) {
      const invalid = await messenger.runtime.sendMessage({
        type: "link-guard-validate-broad", hosts: domains
      });
      if (invalid) throw new Error(`${listName}: ${t("broadInvalid", [invalid])}`);
    }
    const disabledWarnings = warnings.BUILTIN.filter(kind => !builtinInputs.get(kind)?.checked);
    const customWarnings = readOwnRules();
    const warningLists = readWarningLists();
    if (warnings.effectiveRules(customWarnings, warningLists).length <
        customWarnings.length + warningLists.filter(list => list.enabled)
          .reduce((sum, list) => sum + list.rules.length, 0)) {
      throw userError(t("warningRuleLimit"));
    }
    const current = await messenger.storage.local.get(storedKeys);
    if (snapshot(current) !== baseline) {
      showStatus(t("settingsChanged"), true);
      return;
    }
    const updated = { enabled: enabledInput.checked, showDestinations: destinationsInput.checked,
      customAllowedHosts, blockedHosts, blockedDomains, broadAllowedDomains,
      importedLists, disabledWarnings, customWarnings, warningLists };
    saving = true;
    await messenger.storage.local.set(updated);
    baseline = snapshot(updated);
    dirty = false;
    customInput.value = customAllowedHosts.join("\n");
    blockedInput.value = blockedHosts.join("\n");
    broadInput.value = formatRuleList([], broadAllowedDomains);
    blockedDomainsInput.value = formatRuleList([], blockedDomains);
    showStatus(t("settingsSaved"));
  } catch (error) {
    showStatus(error.userFacing || error.message?.includes(": ") ? error.message : t("settingsSaveFailed"), true);
  } finally {
    saving = false;
  }
});

load();
