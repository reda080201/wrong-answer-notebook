import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("release config pins the per-user NSIS installer and a non-empty updater public key", async () => {
  const config = JSON.parse(await readFile(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
  assert.equal(config.bundle?.windows?.nsis?.installMode, "currentUser");
  assert.equal(config.bundle?.createUpdaterArtifacts, true);
  assert.match(config.plugins?.updater?.pubkey ?? "", /^[A-Za-z0-9+/=]+$/);
  assert.ok((config.plugins?.updater?.pubkey ?? "").length > 40);
});

test("release workflow requires main-tag parity, signing secrets, and signed updater artifact verification", async () => {
  const workflow = await readFile(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
  assert.match(workflow, /git fetch origin main --depth=1/);
  assert.match(workflow, /release tag must point at origin\/main/);
  assert.match(workflow, /updater signature is missing for/);
  assert.match(workflow, /updater asset is not an NSIS installer/);
  assert.match(workflow, /apiUrl -eq \$platform\.url/);
  assert.match(workflow, /tagName: \$\{\{ github\.event_name/);
  assert.match(workflow, /Get-FileHash -Algorithm SHA256/);
  assert.doesNotMatch(workflow, /tauri -- build --no-bundle/);
});
