import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const launcherNames = [
  "run.bat",
  "run-preview.bat",
  "run-web.bat",
  "run-web-isolated.bat",
  "run-dev.bat",
];

async function readLaunchers() {
  const entries = await Promise.all(
    launcherNames.map(async (name) => [name, await readFile(path.join(root, name), "utf8")]),
  );
  return Object.fromEntries(entries);
}

test("preview runtime launchers declare distinct runtime modes", async () => {
  const launchers = await readLaunchers();

  assert.match(launchers["run.bat"], /run-desktop\.bat/i);
  assert.match(launchers["run-preview.bat"], /MODE=SOURCE-PREVIEW/i);
  assert.match(launchers["run-web.bat"], /MODE=WEB/i);
  assert.match(launchers["run-web-isolated.bat"], /MODE=WEB-ISOLATED/i);
  assert.match(launchers["run-dev.bat"], /MODE=TAURI-DEV/i);
});

test("launchers use only the tools required by their runtime", async () => {
  const launchers = await readLaunchers();
  const installed = launchers["run.bat"];

  assert.doesNotMatch(installed, /\b(node|npm|cargo|rustc|vite|tauri)\b/i);
  assert.match(launchers["run-preview.bat"], /\b(?:node|npm)\b/i);
  assert.match(launchers["run-web.bat"], /run-preview\.bat/i);
  assert.match(launchers["run-web-isolated.bat"], /\b(?:node|npm)\b/i);
  assert.match(launchers["run-dev.bat"], /\bnode\b/i);
  assert.match(launchers["run-dev.bat"], /\brustc\b/i);
});

test("runtime launchers preserve the storage backend boundary", async () => {
  const launchers = await readLaunchers();
  const web = launchers["run-web.bat"];
  const isolated = launchers["run-web-isolated.bat"];
  const preview = launchers["run-preview.bat"];
  const dev = launchers["run-dev.bat"];

  assert.match(web, /run-preview\.bat/i);
  assert.doesNotMatch(web, /CARGO_TARGET_DIR|cargo|rustc/i);
  assert.doesNotMatch(web, /localStorage/i);

  assert.match(isolated, /(?:localStorage|WEB-ISOLATED)/i);
  assert.doesNotMatch(isolated, /launch-web\.mjs|CARGO_TARGET_DIR|cargo|rustc/i);
  assert.match(preview, /SOURCE-PREVIEW/i);
  assert.doesNotMatch(preview, /launch-web\.mjs|CARGO_TARGET_DIR|cargo|rustc/i);

  assert.match(dev, /npm run dev:desktop/i);
  assert.match(dev, /CARGO_TARGET_DIR=.*WrongAnswerNotebookDev[\\/]cargo-target/i);
  assert.doesNotMatch(dev, /localStorage/i);
});
