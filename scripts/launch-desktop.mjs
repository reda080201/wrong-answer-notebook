import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runNpm, synchronizeDependencies } from "./dependency-sync.mjs";

export const RUNTIME_STATE_VERSION = 1;
export const RUNTIME_STATE_FILE = ".wrong-answer-notebook-runtime-state.json";
export const RUNTIME_FINGERPRINT_PATHS = [
  "package.json",
  "package-lock.json",
  "src",
  "src-tauri/src",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "src-tauri/tauri.conf.json",
  "src-tauri/build.rs",
];

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  const details = await stat(absolutePath);
  if (details.isFile()) return [relativePath];
  if (!details.isDirectory()) return [];

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const childPath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(root, childPath));
    else if (entry.isFile()) files.push(childPath);
  }
  return files;
}

export async function calculateRuntimeFingerprint(root) {
  const hash = createHash("sha256");
  hash.update(`desktop-runtime-v${RUNTIME_STATE_VERSION}\0`);
  const files = [];
  for (const relativePath of RUNTIME_FINGERPRINT_PATHS) {
    files.push(...await collectFiles(root, relativePath));
  }
  for (const relativePath of files.sort()) {
    hash.update(relativePath.replaceAll(path.sep, "/"));
    hash.update("\0");
    hash.update(await readFile(path.join(root, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function runtimeExecutablePath(root, platform = process.platform) {
  const executable = platform === "win32" ? "wrong-answer-notebook.exe" : "wrong-answer-notebook";
  return path.join(root, "src-tauri", "target", "release", executable);
}

export function runtimeStatePath(root) {
  return path.join(root, "src-tauri", "target", "release", RUNTIME_STATE_FILE);
}

export function getRuntimeReadiness({ stamp, fingerprint, releaseExecutableExists }) {
  if (!releaseExecutableExists) return { ready: false, reason: "release executable is missing" };
  if (!stamp) return { ready: false, reason: "runtime fingerprint stamp is missing" };
  if (stamp.version !== RUNTIME_STATE_VERSION) return { ready: false, reason: "runtime fingerprint stamp version changed" };
  if (stamp.fingerprint !== fingerprint) return { ready: false, reason: "runtime fingerprint changed" };
  return { ready: true, reason: "runtime fingerprint and release executable match" };
}

export function runtimeBuildCommand() {
  return ["run", "tauri", "--", "build", "--no-bundle"];
}

export function formatTiming(label, milliseconds) {
  return `[STARTUP] ${label}=${Math.round(milliseconds)}ms`;
}

async function readRuntimeStamp(root) {
  try {
    return JSON.parse(await readFile(runtimeStatePath(root), "utf8"));
  } catch {
    return null;
  }
}

export async function writeRuntimeStamp(root, fingerprint) {
  const target = runtimeStatePath(root);
  const temporary = `${target}.${process.pid}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify({
    version: RUNTIME_STATE_VERSION,
    fingerprint,
    executable: path.relative(root, runtimeExecutablePath(root)),
    stampedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export function launchReleaseExecutable(executable, root, spawnImpl = spawn) {
  const tracePath = path.join(root, "src-tauri", "target", "release", ".frontend-ready");
  return new Promise((resolve, reject) => {
    const child = spawnImpl(executable, [], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env: { ...process.env, WRONG_ANSWER_STARTUP_TRACE: tracePath },
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function waitForFrontendReady(root, timeoutMs = 30_000) {
  const tracePath = path.join(root, "src-tauri", "target", "release", ".frontend-ready");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await exists(tracePath)) return Date.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("WebView first paint readiness signal timed out");
}

export async function launchDesktop({
  root,
  synchronize = synchronizeDependencies,
  build = (projectRoot) => runNpm(projectRoot, runtimeBuildCommand()),
  launch = launchReleaseExecutable,
  waitForReady = launch === launchReleaseExecutable ? waitForFrontendReady : async () => 0,
  log = console.log,
  now = performance.now,
} = {}) {
  const totalStarted = now();
  const dependencyStarted = now();
  await synchronize(root);
  const dependencyMilliseconds = now() - dependencyStarted;
  log(formatTiming("dependency-check", dependencyMilliseconds));

  const fingerprint = await calculateRuntimeFingerprint(root);
  const executable = runtimeExecutablePath(root);
  const readiness = getRuntimeReadiness({
    stamp: await readRuntimeStamp(root),
    fingerprint,
    releaseExecutableExists: await exists(executable),
  });

  let buildMilliseconds = 0;
  if (!readiness.ready) {
    log(`[STARTUP] ${readiness.reason}; building release executable`);
    const buildStarted = now();
    await build(root);
    const builtFingerprint = await calculateRuntimeFingerprint(root);
    if (!(await exists(executable))) throw new Error("Tauri build completed without a release executable");
    await writeRuntimeStamp(root, builtFingerprint);
    buildMilliseconds = now() - buildStarted;
  }
  log(formatTiming("rust/tauri", buildMilliseconds));

  const launchStarted = now();
  await rm(path.join(root, "src-tauri", "target", "release", ".frontend-ready"), { force: true });
  await launch(executable, root);
  const launchMilliseconds = now() - launchStarted;
  log(formatTiming("process-launch", launchMilliseconds));
  const webviewStarted = now();
  await waitForReady(root);
  const webviewMilliseconds = now() - webviewStarted;
  log(formatTiming("webview-ready", webviewMilliseconds));
  log(formatTiming("total", now() - totalStarted));
  return { built: !readiness.ready, dependencyMilliseconds, buildMilliseconds, launchMilliseconds, webviewMilliseconds };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try {
    await launchDesktop({ root });
  } catch (error) {
    console.error(`[STARTUP] launch failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
