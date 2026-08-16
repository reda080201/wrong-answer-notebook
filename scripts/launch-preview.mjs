import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { synchronizeDependencies } from "./dependency-sync.mjs";
import { calculateDevelopmentBridgeFingerprint } from "./development-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = "reda080201/wrong-answer-notebook";
const bridgeReleaseTag = process.env.WRONG_ANSWER_PREVIEW_BRIDGE_TAG || "preview-bridge";
const manifestUrl = process.env.WRONG_ANSWER_PREVIEW_BRIDGE_MANIFEST_URL
  || `https://github.com/${repository}/releases/download/${bridgeReleaseTag}/preview-bridge-windows-x86_64.json`;
const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || root, "AppData", "Local");
const cacheDir = process.env.WRONG_ANSWER_PREVIEW_BRIDGE_CACHE
  || path.join(localAppData, "WrongAnswerNotebookDev", "bin");
const executableName = "dev-storage-bridge.exe";
const executablePath = path.join(cacheDir, executableName);
const manifestPath = path.join(cacheDir, "preview-bridge-manifest.json");
const dataDir = process.env.WRONG_ANSWER_STORAGE_DIR
  || path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || root, "AppData", "Roaming"), "com.wronganswer.notebook");

async function exists(filename) {
  try { await access(filename); return true; } catch { return false; }
}

async function sha256(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`preview bridge 다운로드 실패 (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchManifest() {
  const manifest = await (async () => {
    const response = await fetch(manifestUrl, { redirect: "follow" });
    if (!response.ok) throw new Error(`preview bridge manifest를 받을 수 없습니다 (${response.status})`);
    return response.json();
  })();
  if (manifest.schemaVersion !== 1 || manifest.platform !== "windows-x86_64"
    || typeof manifest.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(manifest.sha256)
    || !Number.isSafeInteger(manifest.size) || manifest.size <= 0) {
    throw new Error("preview bridge manifest 형식이 올바르지 않습니다.");
  }
  if (manifest.asset !== executableName && !String(manifest.asset || "").endsWith(".exe")) {
    throw new Error("preview bridge 실행 파일 이름이 올바르지 않습니다.");
  }
  return manifest;
}

async function installVerifiedBridge(manifest) {
  await mkdir(cacheDir, { recursive: true });
  const assetUrl = manifest.url || `${manifestUrl.slice(0, manifestUrl.lastIndexOf("/"))}/${encodeURIComponent(manifest.asset)}`;
  const bytes = await fetchBytes(assetUrl);
  if (bytes.length !== manifest.size || createHash("sha256").update(bytes).digest("hex") !== manifest.sha256) {
    throw new Error("preview bridge checksum 또는 크기가 manifest와 일치하지 않습니다.");
  }
  const temporary = `${executablePath}.${process.pid}.download`;
  await writeFile(temporary, bytes, { mode: 0o755 });
  await rename(temporary, executablePath);
  const manifestTemporary = `${manifestPath}.${process.pid}.tmp`;
  await writeFile(manifestTemporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(manifestTemporary, manifestPath);
}

export async function resolveVerifiedBridge() {
  const fingerprint = await calculateDevelopmentBridgeFingerprint(root);
  let manifest;
  try { manifest = await readJson(manifestPath); } catch { manifest = null; }
  const validCached = manifest && manifest.fingerprint === fingerprint
    && manifest.platform === "windows-x86_64"
    && await exists(executablePath)
    && (await stat(executablePath)).size === manifest.size
    && await sha256(executablePath) === manifest.sha256;
  if (!validCached) {
    manifest = await fetchManifest();
    if (manifest.fingerprint !== fingerprint) {
      throw new Error("현재 Rust storage bridge와 일치하는 preview helper가 없습니다. 전체 데스크톱 개발은 run-dev.bat을 사용하세요.");
    }
    await installVerifiedBridge(manifest);
  }
  return executablePath;
}

function command(name, args, options = {}) {
  const executable = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : name;
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", name, ...args] : args;
  return spawn(executable, commandArgs, { cwd: root, stdio: options.stdio || "inherit", shell: false, env: options.env || process.env });
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

async function ensurePortFree() {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 1420 });
    socket.once("connect", () => { socket.destroy(); reject(new Error("127.0.0.1:1420이 이미 사용 중입니다. 기존 개발 서버의 PID를 확인하고 종료한 뒤 다시 실행하세요.")); });
    socket.once("error", () => resolve());
  });
}

async function waitForLine(child, pattern, timeoutMs = 30_000) {
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("데스크톱 저장소 연결 준비 시간을 초과했습니다.")), timeoutMs);
    const consume = (chunk) => {
      output += chunk.toString();
      process.stdout.write(chunk);
      if (pattern.test(output)) { clearTimeout(timer); resolve(); }
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`데스크톱 저장소 bridge가 시작되지 않았습니다. (exit ${code})`)); });
    child.once("error", reject);
  });
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if ((await fetch(url)).ok) return; } catch { /* startup polling */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Vite 준비 시간을 초과했습니다.");
}

function openBrowser(url) {
  if (process.env.WRONG_ANSWER_NO_BROWSER === "1") return;
  if (process.platform === "win32") spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
}

const children = [];
function stopChildren() { for (const child of children.reverse()) if (!child.killed) child.kill(); }
process.once("SIGINT", () => { stopChildren(); process.exit(130); });
process.once("SIGTERM", () => { stopChildren(); process.exit(143); });
process.once("exit", stopChildren);

try {
  const started = performance.now();
  await ensurePortFree();
  await synchronizeDependencies(root);
  const bridgePath = await resolveVerifiedBridge();
  const port = await freePort();
  const token = randomBytes(32).toString("base64url");
  const bridge = spawn(bridgePath, ["--data-dir", dataDir, "--port", String(port), "--token", token], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  children.push(bridge);
  await waitForLine(bridge, /BRIDGE_READY/);
  const vite = command("npm", ["run", "dev:web", "--", "--host", "127.0.0.1"], {
    stdio: "inherit",
    env: { ...process.env, WRONG_ANSWER_DESKTOP_PROXY: "1", VITE_STORAGE_MODE: "desktop-shared", VITE_SOURCE_PREVIEW: "1", VITE_DESKTOP_STORAGE_BRIDGE_URL: `http://127.0.0.1:${port}`, VITE_DESKTOP_STORAGE_BRIDGE_TOKEN: token },
  });
  children.push(vite);
  await waitForHttp("http://127.0.0.1:1420");
  console.log(`[preview] SOURCE PREVIEW ready in ${Math.round(performance.now() - started)}ms: http://127.0.0.1:1420`);
  openBrowser("http://127.0.0.1:1420");
  await new Promise((resolve) => vite.once("exit", resolve));
} catch (error) {
  stopChildren();
  console.error(`[preview] 데스크톱 데이터 연결 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
  console.error("[preview] localStorage fallback을 사용하지 않습니다. 전체 데스크톱 개발은 run-dev.bat을 사용하세요.");
  process.exitCode = 1;
}
