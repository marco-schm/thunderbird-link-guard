"use strict";

const policy = globalThis.LinkGuardPolicy;
const listImport = globalThis.LinkGuardImport;
const t = (key, values) => messenger.i18n.getMessage(key, values) || key;
const importedInputs = new Map();
const enabledInput = document.getElementById("enabled");
const customInput = document.getElementById("customHosts");
const blockedInput = document.getElementById("blockedHosts");
const broadInput = document.getElementById("broadDomains");
const status = document.getElementById("status");
const storedKeys = { enabled: true, customAllowedHosts: [], blockedHosts: [],
  broadAllowedDomains: [], importedLists: [] };
let baseline = "";
let dirty = false;
let saving = false;
let pendingImport = null;

function snapshot(value) {
  return JSON.stringify(Object.fromEntries(Object.keys(storedKeys).map(key => [key, value[key]])));
}

document.documentElement.lang = messenger.i18n.getUILanguage();
document.title = t("settingsTitle");
for (const element of document.querySelectorAll("[data-i18n]")) {
  element.textContent = t(element.dataset.i18n);
}

function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function showImportError(error, fallback = "importFetch") {
  const known = new Set(["importTooLarge", "importFormat", "importDuplicate", "importUrl", "importFetch"]);
  showStatus(t(known.has(error?.message) ? error.message : fallback), true);
}

function readHosts(input, label) {
  const result = policy.parseHostList(input.value);
  if (result.errors.length) {
    const issue = result.errors[0];
    const reason = issue === "limit" ? t("hostLimit") : t("invalidHostLine", [String(issue)]);
    throw new Error(`${label}: ${reason}`);
  }
  return result.hosts;
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
  count.textContent = `${t(`category_${item.category}`)} · ${t("hostCount", [String(item.hosts.length)])}`;
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
  textarea.setAttribute("aria-label", `${item.name}: ${t("listHosts")}`);
  textarea.addEventListener("input", () => {
    count.textContent = `${t(`category_${item.category}`)} · ${t("hostCount", [String(textarea.value.split(/\r?\n/).filter(x => x.trim()).length)])}`;
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
  card.append(top, details);
  importedInputs.set(item.id, { item, checkbox, textarea, card });
  return card;
}

function showPreview(item, replacingId = null) {
  pendingImport = { ...item, replacingId };
  const box = document.getElementById("importPreview");
  const title = document.createElement("h3");
  title.textContent = `${replacingId ? t("refreshTitle") : t("importPreviewTitle")}: ${item.name}`;
  const info = document.createElement("p");
  info.textContent = `${t(`category_${item.category}`)} · ${t("hostCount", [String(item.hosts.length)])}`;
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
      hosts: pendingImport.hosts, sourceUrl: pendingImport.sourceUrl || "",
      enabled: false };
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

async function load() {
  try {
    const saved = await messenger.storage.local.get(storedKeys);
    baseline = snapshot(saved);
    enabledInput.checked = saved.enabled !== false;
    customInput.value = (saved.customAllowedHosts || []).join("\n");
    blockedInput.value = (saved.blockedHosts || []).join("\n");
    broadInput.value = (saved.broadAllowedDomains || []).join("\n");
    const imported = document.getElementById("importedLists");
    imported.replaceChildren();
    importedInputs.clear();
    for (const item of listImport.cleanStored(saved.importedLists)) {
      imported.append(createImported(item));
    }
    pendingImport = null;
    document.getElementById("importPreview").hidden = true;
    dirty = false;
  } catch { showStatus(t("settingsLoadFailed"), true); }
}

document.addEventListener("input", event => {
  if (event.target.matches("textarea, input[type=checkbox]")) dirty = true;
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
  if (event.target.matches("textarea, input[type=checkbox]")) dirty = true;
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
    const broadAllowedDomains = readHosts(broadInput, t("broadTitle"));
    const invalidBroad = await messenger.runtime.sendMessage({
      type: "link-guard-validate-broad", hosts: broadAllowedDomains
    });
    if (invalidBroad) throw new Error(`${t("broadTitle")}: ${t("broadInvalid", [invalidBroad])}`);
    const importedLists = [];
    for (const [id, view] of importedInputs) {
      const hosts = readHosts(view.textarea, view.item.name);
      if (!hosts.length) throw new Error(t("importEmpty"));
      importedLists.push({ ...view.item, id, hosts, enabled: view.checkbox.checked });
    }
    const current = await messenger.storage.local.get(storedKeys);
    if (snapshot(current) !== baseline) {
      showStatus(t("settingsChanged"), true);
      return;
    }
    const updated = { enabled: enabledInput.checked,
      customAllowedHosts, blockedHosts, broadAllowedDomains,
      importedLists };
    saving = true;
    await messenger.storage.local.set(updated);
    baseline = snapshot(updated);
    dirty = false;
    customInput.value = customAllowedHosts.join("\n");
    blockedInput.value = blockedHosts.join("\n");
    broadInput.value = broadAllowedDomains.join("\n");
    showStatus(t("settingsSaved"));
  } catch (error) {
    showStatus(error.message?.includes(": ") ? error.message : t("settingsSaveFailed"), true);
  } finally {
    saving = false;
  }
});

load();
