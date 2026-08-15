import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { synchronizeDependencies } from "./dependency-sync.mjs";
import { calculateDevelopmentBridgeFingerprint, developmentCargoTargetDir } from "./development-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cargoTargetDir = developmentCargoTargetDir();
const bridgeExecutable = path.join(cargoTargetDir, "release", process.platform === "win32" ? "dev-storage-bridge.exe" : "dev-storage-bridge");
const bridgeStamp = path.join(cargoTargetDir, "release", ".dev-storage-bridge-fingerprint");
const dataDir = process.env.WRONG_ANSWER_STORAGE_DIR
  || path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || root, "AppData", "Roaming"), "com.wronganswer.notebook");

function logTiming(label, started) {
  console.log(`[web runtime] ${label}=${Math.round(performance.now() - started)}ms`);
}

function command(name, args, options = {}) {
  const executable = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : name;
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", name, ...args] : args;
  return spawn(executable, commandArgs, { cwd: root, stdio: options.stdio || "inherit", shell: false, env: options.env || process.env });
}

async function run(name, args) {
  await new Promise((resolve, reject) => {
    const child = command(name, args);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${name} ${args.join(" ")} 실패 (exit ${code})`)));
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function ensureVitePortFree() {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 1420 });
    socket.once("connect", () => { socket.destroy(); reject(new Error("127.0.0.1:1420이 이미 사용 중입니다. 기존 개발 서버의 PID를 확인하고 종료한 뒤 다시 실행하세요.")); });
    socket.once("error", () => resolve());
  });
}

async function waitForLine(child, pattern, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`준비 신호를 ${timeoutMs}ms 안에 받지 못했습니다.`)), timeoutMs);
    const consume = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      if (pattern.test(output)) { clearTimeout(timer); resolve(); }
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`프로세스가 준비 전에 종료됐습니다. (exit ${code})`)); });
    child.once("error", reject);
  });
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* startup polling */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Vite 준비 시간을 초과했습니다.");
}

function openBrowser(url) {
  if (process.env.WRONG_ANSWER_NO_BROWSER === "1") return;
  if (process.platform === "win32") {
    spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  }
}

const children = [];
function stopChildren() {
  for (const child of children.reverse()) {
    if (!child.killed) child.kill();
  }
}
process.once("SIGINT", () => { stopChildren(); process.exit(130); });
process.once("SIGTERM", () => { stopChildren(); process.exit(143); });
process.once("exit", stopChildren);

try {
  const totalStarted = performance.now();
  await ensureVitePortFree();
  const dependencyStarted = performance.now();
  await synchronizeDependencies(root);
  logTiming("dependency-check", dependencyStarted);

  const bridgeBuildStarted = performance.now();
  const bridgeFingerprint = await calculateDevelopmentBridgeFingerprint(root);
  let installedBridgeFingerprint = "";
  try { installedBridgeFingerprint = (await readFile(bridgeStamp, "utf8")).trim(); } catch { /* missing stamp */ }
  if (!existsSync(bridgeExecutable) || installedBridgeFingerprint !== bridgeFingerprint || process.env.WRONG_ANSWER_REBUILD_BRIDGE === "1") {
    await run("cargo", ["build", "--release", "--manifest-path", "src-tauri/Cargo.toml", "--bin", "dev-storage-bridge"]);
    const temporary = `${bridgeStamp}.${process.pid}.tmp`;
    await writeFile(temporary, `${bridgeFingerprint}\n`, "utf8");
    await rename(temporary, bridgeStamp);
  }
  logTiming("bridge-build", bridgeBuildStarted);

  const port = await freePort();
  const token = randomBytes(32).toString("base64url");
  const bridge = spawn(bridgeExecutable, ["--data-dir", dataDir, "--port", String(port), "--token", token], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  children.push(bridge);
  const bridgeStarted = performance.now();
  await waitForLine(bridge, /BRIDGE_READY/);
  logTiming("storage-bridge-ready", bridgeStarted);

  const vite = command("npm", ["run", "dev:web", "--", "--host", "127.0.0.1"], {
    stdio: "inherit",
    env: {
      ...process.env,
      WRONG_ANSWER_DESKTOP_PROXY: "1",
      VITE_DESKTOP_STORAGE_BRIDGE_URL: `http://127.0.0.1:${port}`,
      VITE_DESKTOP_STORAGE_BRIDGE_TOKEN: token,
    },
  });
  children.push(vite);
  const viteStarted = performance.now();
  await waitForHttp("http://127.0.0.1:1420");
  logTiming("vite-ready", viteStarted);
  logTiming("total", totalStarted);
  openBrowser("http://127.0.0.1:1420");
  await new Promise((resolve) => vite.once("exit", resolve));
  stopChildren();
} catch (error) {
  stopChildren();
  console.error(`[web runtime] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
