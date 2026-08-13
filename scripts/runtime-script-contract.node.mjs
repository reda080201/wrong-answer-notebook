import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("desktop startup synchronizes dependencies before Tauri and never opens a browser", async () => {
  const script = await readFile(path.join(root, "run-desktop.bat"), "utf8");
  assert.match(script, /MODE=TAURI/);
  assert.ok(script.indexOf("sync-dependencies.mjs") < script.indexOf("npm run dev:desktop"));
  assert.match(script, /if not "%ERRORLEVEL%"=="0" goto dependency_error/);
  assert.doesNotMatch(script, /start http|dev:web/);
});

test("web startup synchronizes dependencies before Vite and owns browser launch", async () => {
  const script = await readFile(path.join(root, "run-web.bat"), "utf8");
  assert.match(script, /MODE=WEB/);
  assert.ok(script.indexOf("sync-dependencies.mjs") < script.indexOf("npm run dev:web"));
  assert.match(script, /if not "%ERRORLEVEL%"=="0" goto dependency_error/);
  assert.match(script, /start http:\/\/localhost:1420/);
});
