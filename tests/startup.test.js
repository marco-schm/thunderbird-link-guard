const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("message protection is registered before background startup", () => {
  const manifest = require("../manifest.json");
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "151.0");
  assert.deepEqual(manifest.message_display_scripts, [{
    js: ["policy.js", "access.js", "display.js"],
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
  assert.deepEqual(Array.from(calls[2].details.files), ["policy.js", "access.js", "display.js"]);
});
