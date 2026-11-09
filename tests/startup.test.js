const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("message protection is registered before background startup", () => {
  const manifest = require("../manifest.json");
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "151.0");
  assert.deepEqual(manifest.message_display_scripts, [{
    js: ["english.js", "locale.js", "policy.js", "access.js", "safe-regex.js", "warning-rules.js", "panel-style.js", "display.js"],
    css: ["display.css"], run_at: "document_start"
  }]);
});

test("startup repairs an already open message tab only when unprotected", async () => {
  const calls = [];
  const messenger = {
    tabs: { async query() { return [{ id: 1, type: "messageDisplay" }]; } },
    scripting: {
      async executeScript(details) {
        calls.push({ kind: "script", details });
        return details.func ? [{ result: false }] : [];
      },
      async insertCSS(details) { calls.push({ kind: "css", details }); }
    },
    action: { onClicked: { addListener() {} } },
    messageDisplayAction: { onClicked: { addListener() {} } },
    messageDisplay: { onMessagesDisplayed: { addListener() {} } },
    runtime: { onMessage: { addListener() {} }, openOptionsPage() {} },
    i18n: { getMessage(key) { return key; } }
  };
  const context = vm.createContext({ messenger, console, Promise });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../background.js"), "utf8"), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.map(call => call.kind), ["script", "css", "script"]);
  assert.deepEqual(Array.from(calls[2].details.files), ["english.js", "locale.js", "policy.js", "access.js", "safe-regex.js", "warning-rules.js", "panel-style.js", "display.js"]);
});

test("the package script ships every file the manifest loads", () => {
  const manifest = require("../manifest.json");
  const script = fs.readFileSync(path.join(__dirname, "../scripts/package.sh"), "utf8");
  const files = [...manifest.background.scripts,
    ...manifest.message_display_scripts.flatMap(entry => [...entry.js, ...entry.css])];
  for (const file of files) assert.ok(script.split(/\s+/).includes(file), file);
  assert.ok(manifest.message_display_scripts[0].js.indexOf("panel-style.js") <
    manifest.message_display_scripts[0].js.indexOf("display.js"));
});

test("the panel stylesheet is exposed as a string for the shadow root", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../panel-style.js"), "utf8"), context);
  assert.match(context.LinkGuardPanelCss, /\.link-guard-panel\s*\{/);
  assert.match(context.LinkGuardPanelCss, /\.link-guard-panel button\s*\{/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "../display.css"), "utf8"), /link-guard-panel/);
});

// Message CSS cannot reach into the closed shadow root, but every declaration is still
// !important so the panel keeps its look even if a rule ever leaked in.
test("every declaration in the panel stylesheet is important", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../panel-style.js"), "utf8"), context);
  const css = context.LinkGuardPanelCss.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of css.matchAll(/\{([^{}]*)\}/g)) {
    for (const declaration of block[1].split(";").map(part => part.trim()).filter(Boolean)) {
      assert.match(declaration, /!important$/, declaration);
    }
  }
});

// Inline styles cannot reach pseudo-elements; message CSS could inject text into the
// panel host or a label with ::before/::after. Shadow-scoped !important rules win.
test("shadow roots on the page neutralise the host's pseudo-elements", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../panel-style.js"), "utf8"), context);
  const guard = context.LinkGuardHostGuardCss;
  assert.match(guard, /:host::before,\s*:host::after\s*\{[^}]*content:\s*none !important/);
  assert.match(guard, /:host::first-line,\s*:host::first-letter\s*\{[^}]*color:\s*inherit !important/);
  assert.ok(context.LinkGuardPanelCss.startsWith(guard));
  assert.match(fs.readFileSync(path.join(__dirname, "../display.js"), "utf8"),
    /guard\.textContent = globalThis\.LinkGuardHostGuardCss/);
});
