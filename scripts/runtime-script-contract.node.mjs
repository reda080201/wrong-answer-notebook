import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { developmentCargoTargetDir } from "./development-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userLauncherBuildTerms = /node|npm|cargo|rustc|vite|tauri|node_modules|src-tauri[\\/]target|\bdist\b|sync-dependencies/i;

test("normal user launchers only resolve and start the installed application", async () => {
  const [run, desktop] = await Promise.all([
    readFile(path.join(root, "run.bat"), "utf8"),
    readFile(path.join(root, "run-desktop.bat"), "utf8"),
  ]);
  assert.match(desktop, /MODE=INSTALLED/);
  assert.match(desktop, /Start Menu\\Programs\\오답노트\.lnk/);
  assert.match(desktop, /github\.com\/reda080201\/wrong-answer-notebook\/releases/);
  assert.match(desktop, /exit \/b 1/);
  assert.match(desktop, /start "" "%START_MENU_SHORTCUT%"/);
  assert.doesNotMatch(`${run}\n${desktop}`, userLauncherBuildTerms);
});

test("shared Web and isolated development launchers have explicit storage contracts", async () => {
  const [desktop, web, isolatedWeb, webLauncher] = await Promise.all([
    readFile(path.join(root, "run-dev.bat"), "utf8"),
    readFile(path.join(root, "run-web.bat"), "utf8"),
    readFile(path.join(root, "run-web-isolated.bat"), "utf8"),
    readFile(path.join(root, "scripts", "launch-web.mjs"), "utf8"),
  ]);
  assert.match(web, /launch-web\.mjs --shared/);
  assert.doesNotMatch(web, /isolated/i);
  assert.match(isolatedWeb, /launch-web\.mjs --isolated/);
  assert.match(isolatedWeb, /CARGO_TARGET_DIR=.*WrongAnswerNotebookDev\\cargo-target/);
  for (const script of [desktop, isolatedWeb]) {
    assert.match(script, /CARGO_TARGET_DIR=.*WrongAnswerNotebookDev\\cargo-target/);
  }
  assert.match(desktop, /sync-dependencies\.mjs/);
  assert.match(desktop, /npm run dev:desktop/);
  assert.match(webLauncher, /synchronizeDependencies/);
  assert.match(webLauncher, /developmentCargoTargetDir/);
  assert.match(webLauncher, /openBrowser\("http:\/\/127\.0\.0\.1:1420"\)/);
  assert.match(webLauncher, /VITE_STORAGE_MODE: "desktop-shared"/);
  assert.match(webLauncher, /VITE_STORAGE_MODE: "isolated-browser"/);
});

test("development Cargo target defaults outside the source checkout", () => {
  const target = developmentCargoTargetDir({ LOCALAPPDATA: "C:\\Users\\Student\\AppData\\Local" }, "win32");
  assert.equal(target, "C:\\Users\\Student\\AppData\\Local\\WrongAnswerNotebookDev\\cargo-target");
});

test("legacy artifact cleanup remains opt-in, allowlisted, and AppData-safe", async () => {
  const script = await readFile(path.join(root, "scripts", "inspect-legacy-build-artifacts.ps1"), "utf8");
  assert.match(script, /\[switch\]\$Remove/);
  assert.match(script, /node_modules/);
  assert.match(script, /src-tauri[\\\\]target/);
  assert.match(script, /ReparsePoint/);
  assert.match(script, /Read-Host/);
  assert.match(script, /Remove-Item -LiteralPath/);
  assert.doesNotMatch(script, /APPDATA.*Remove-Item|Remove-Item.*APPDATA/i);
});
