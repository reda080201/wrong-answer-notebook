import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { synchronizeDependencies } from "./dependency-sync.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function command(name, args, env) {
  const executable = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : name;
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", name, ...args] : args;
  return spawn(executable, commandArgs, { cwd: root, stdio: "inherit", shell: false, env });
}

try {
  await synchronizeDependencies(root);
  const vite = command("npm", ["run", "dev:web", "--", "--host", "127.0.0.1"], {
    ...process.env,
    VITE_STORAGE_MODE: "isolated-browser",
    VITE_SOURCE_PREVIEW: "1",
  });
  const code = await new Promise((resolve, reject) => {
    vite.once("error", reject);
    vite.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  process.exitCode = code;
} catch (error) {
  console.error(`[web isolated] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
