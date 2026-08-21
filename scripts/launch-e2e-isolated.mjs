import { spawn } from "node:child_process";
import process from "node:process";

const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", "npm", "run", "dev:web", "--", "--host", "127.0.0.1", "--port", "1420"]
  : ["run", "dev:web", "--", "--host", "127.0.0.1", "--port", "1420"];
const child = spawn(command, args, {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: false,
  env: { ...process.env, VITE_STORAGE_MODE: "isolated-browser" },
  windowsHide: true,
});

function stop() {
  if (!child.killed) child.kill();
}
process.once("SIGINT", () => { stop(); process.exit(130); });
process.once("SIGTERM", () => { stop(); process.exit(143); });
process.once("exit", stop);
child.once("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
