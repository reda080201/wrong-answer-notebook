import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { developmentCargoTargetDir } from "./development-runtime.mjs";

const root = process.cwd();
const dataDir = path.join(root, "test-results", `shared-storage-${process.pid}`);
const runtimeFile = path.join(root, "test-results", "shared-bridge-runtime.json");
const cargoTargetDir = developmentCargoTargetDir();
const bridgeExecutable = path.join(cargoTargetDir, "release", process.platform === "win32" ? "dev-storage-bridge.exe" : "dev-storage-bridge");
const token = randomBytes(32).toString("base64url");
process.env.CARGO_TARGET_DIR = cargoTargetDir;

function command(name, args, options = {}) {
  const executable = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : name;
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", name, ...args] : args;
  return spawn(executable, commandArgs, { cwd: root, stdio: options.stdio || "inherit", shell: false, env: options.env || process.env, windowsHide: true });
}

function run(name, args) {
  return new Promise((resolve, reject) => {
    const child = command(name, args);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${name} ${args.join(" ")} failed (exit ${code})`)));
  });
}

function freePort() {
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

function waitForLine(child, pattern) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("storage bridge readiness timed out")), 45_000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (pattern.test(output)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`storage bridge exited before ready (${code})`)));
  });
}

async function waitForHttp(url) {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* startup polling */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Vite readiness timed out");
}

const children = [];
function stopChildren() {
  for (const child of children.reverse()) {
    if (!child.killed) child.kill();
  }
}
process.once("SIGINT", () => { stopChildren(); process.exit(130); });
process.once("SIGTERM", () => { stopChildren(); process.exit(143); });
process.once("exit", () => { stopChildren(); });

try {
  await mkdir(dataDir, { recursive: true });
  await run("cargo", ["build", "--release", "--manifest-path", "src-tauri/Cargo.toml", "--bin", "dev-storage-bridge"]);
  const port = await freePort();
  const bridge = spawn(bridgeExecutable, ["--data-dir", dataDir, "--port", String(port), "--token", token], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRONG_ANSWER_STORAGE_DIR: dataDir, WRONG_ANSWER_STORAGE_TOKEN: token, WRONG_ANSWER_STORAGE_PORT: String(port) },
    windowsHide: true,
  });
  children.push(bridge);
  await writeFile(runtimeFile, `${JSON.stringify({ bridgeExecutable, dataDir, token, port, bridgePid: bridge.pid })}\n`, "utf8");
  await waitForLine(bridge, /BRIDGE_READY/);

  const vite = command("npm", ["run", "dev:web", "--", "--host", "127.0.0.1", "--port", "1420"], {
    env: {
      ...process.env,
      VITE_STORAGE_MODE: "desktop-shared",
      WRONG_ANSWER_DESKTOP_PROXY: "1",
      VITE_DESKTOP_STORAGE_BRIDGE_URL: `http://127.0.0.1:${port}`,
      VITE_DESKTOP_STORAGE_BRIDGE_TOKEN: token,
    },
  });
  children.push(vite);
  await waitForHttp("http://127.0.0.1:1420");
  await new Promise((resolve) => vite.once("exit", resolve));
} catch (error) {
  console.error(`[shared e2e] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  stopChildren();
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
}
