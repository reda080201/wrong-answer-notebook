import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  calculateRuntimeFingerprint,
  formatTiming,
  getRuntimeReadiness,
  launchDesktop,
  RUNTIME_FINGERPRINT_PATHS,
  RUNTIME_STATE_VERSION,
  runtimeExecutablePath,
  runtimeBuildCommand,
  runtimeStatePath,
  writeRuntimeStamp,
} from "./launch-desktop.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("run.bat delegates the normal fast desktop release launcher", async () => {
  const script = await readFile(path.join(root, "run.bat"), "utf8");
  assert.match(script, /MODE=TAURI-RELEASE/);
  assert.match(script, /run-desktop\.bat/);
});

test("desktop release startup builds only through the Node launcher and never opens a browser", async () => {
  const script = await readFile(path.join(root, "run-desktop.bat"), "utf8");
  assert.match(script, /MODE=TAURI-RELEASE/);
  assert.match(script, /launch-desktop\.mjs/);
  assert.doesNotMatch(script, /start http|dev:web|dev:desktop/);
});

test("run-dev owns the Tauri dev command", async () => {
  const script = await readFile(path.join(root, "run-dev.bat"), "utf8");
  assert.match(script, /MODE=TAURI-DEV/);
  assert.ok(script.indexOf("sync-dependencies.mjs") < script.indexOf("npm run dev:desktop"));
  assert.doesNotMatch(script, /start http/);
});

test("web startup delegates authenticated desktop storage and browser ownership to the web launcher", async () => {
  const script = await readFile(path.join(root, "run-web.bat"), "utf8");
  assert.match(script, /MODE=WEB/);
  assert.match(script, /launch-web\.mjs/);
  const launcher = await readFile(path.join(root, "scripts", "launch-web.mjs"), "utf8");
  assert.ok(launcher.indexOf("synchronizeDependencies") < launcher.indexOf('npm\", [\"run\", \"dev:web'));
  assert.match(launcher, /randomBytes\(32\)/);
  assert.match(launcher, /VITE_DESKTOP_STORAGE_BRIDGE_TOKEN/);
  assert.match(launcher, /openBrowser\("http:\/\/127\.0\.0\.1:1420"\)/);
});

test("runtime readiness is a pure fingerprint and executable decision", () => {
  const stamp = { version: RUNTIME_STATE_VERSION, fingerprint: "abc" };
  assert.deepEqual(getRuntimeReadiness({ stamp, fingerprint: "abc", releaseExecutableExists: true }), {
    ready: true,
    reason: "runtime fingerprint and release executable match",
  });
  assert.equal(getRuntimeReadiness({ stamp, fingerprint: "changed", releaseExecutableExists: true }).ready, false);
  assert.equal(getRuntimeReadiness({ stamp, fingerprint: "abc", releaseExecutableExists: false }).ready, false);
});

test("runtime helpers expose the no-bundle release command and millisecond timing labels", () => {
  assert.deepEqual(runtimeBuildCommand(), ["run", "tauri", "--", "build", "--no-bundle"]);
  assert.equal(formatTiming("rust/tauri", 12.4), "[STARTUP] rust/tauri=12ms");
});

test("runtime fingerprint changes when a tracked frontend or Tauri input changes", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "desktop-runtime-fingerprint-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const filename of [
    "package.json",
    "package-lock.json",
    "src/main.tsx",
    "src-tauri/src/main.rs",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/tauri.conf.json",
    "src-tauri/build.rs",
  ]) {
    await mkdir(path.dirname(path.join(fixture, filename)), { recursive: true });
    await writeFile(path.join(fixture, filename), "initial");
  }
  const initial = await calculateRuntimeFingerprint(fixture);
  for (const filename of [
    "package.json",
    "package-lock.json",
    "src/main.tsx",
    "src-tauri/src/main.rs",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/tauri.conf.json",
    "src-tauri/build.rs",
  ]) {
    await writeFile(path.join(fixture, filename), `changed:${filename}`);
    assert.notEqual(await calculateRuntimeFingerprint(fixture), initial, filename);
    await writeFile(path.join(fixture, filename), "initial");
  }
});

test("runtime fingerprint ignores frontend test-only changes", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "desktop-runtime-test-fingerprint-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const filename of RUNTIME_FINGERPRINT_PATHS) {
    const target = path.join(fixture, filename);
    if (path.extname(filename)) {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "initial");
    } else {
      await mkdir(target, { recursive: true });
    }
  }
  const testFile = path.join(fixture, "src", "App.test.tsx");
  await writeFile(testFile, "test('first', () => {})");
  const before = await calculateRuntimeFingerprint(fixture);
  await writeFile(testFile, "test('second', () => {})");
  assert.equal(await calculateRuntimeFingerprint(fixture), before);
});

test("unchanged release launches immediately, while a changed runtime builds and stamps atomically", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "desktop-runtime-launch-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const filename of [
    "package.json",
    "package-lock.json",
    "src/main.tsx",
    "src-tauri/src/main.rs",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/tauri.conf.json",
    "src-tauri/build.rs",
  ]) {
    await mkdir(path.dirname(path.join(fixture, filename)), { recursive: true });
    await writeFile(path.join(fixture, filename), "initial");
  }
  const executable = runtimeExecutablePath(fixture);
  await mkdir(path.dirname(executable), { recursive: true });
  await writeFile(executable, "release");
  const fingerprint = await calculateRuntimeFingerprint(fixture);
  await writeRuntimeStamp(fixture, fingerprint);

  const warmLaunches = [];
  const warmResult = await launchDesktop({
    root: fixture,
    synchronize: async () => {},
    build: async () => { throw new Error("warm runtime should not build"); },
    launch: async (filename) => warmLaunches.push(filename),
    log: () => {},
    now: (() => { let value = 0; return () => ++value; })(),
  });
  assert.equal(warmResult.built, false);
  assert.deepEqual(warmLaunches, [executable]);

  await writeFile(path.join(fixture, "src/main.tsx"), "changed");
  const buildCalls = [];
  const timings = [];
  const changedResult = await launchDesktop({
    root: fixture,
    synchronize: async () => {},
    build: async (projectRoot) => {
      buildCalls.push(projectRoot);
      await writeFile(executable, "rebuilt");
    },
    launch: async () => {},
    log: (line) => timings.push(line),
    now: (() => { let value = 0; return () => ++value; })(),
  });
  assert.equal(changedResult.built, true);
  assert.deepEqual(buildCalls, [fixture]);
  assert.match(await readFile(runtimeStatePath(fixture), "utf8"), /"fingerprint"/);
  assert.ok(timings.some((line) => line.includes("dependency-check=") && line.endsWith("ms")));
  assert.ok(timings.some((line) => line.includes("rust/tauri=") && line.endsWith("ms")));
  assert.ok(timings.some((line) => line.includes("launch=") && line.endsWith("ms")));
  assert.ok(timings.some((line) => line.includes("webview-ready=") && line.endsWith("ms")));
  assert.ok(timings.some((line) => line.includes("total=") && line.endsWith("ms")));
});
