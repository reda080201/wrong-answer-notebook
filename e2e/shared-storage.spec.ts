import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { syntheticLifecycleEntry } from "./fixtures/syntheticLifecycle";

type Runtime = { bridgeExecutable: string; dataDir: string; token: string; port: number; bridgePid: number };
let runtime: Runtime;

async function requestStore(method: "GET" | "PUT", value?: unknown) {
  const response = await fetch(`http://127.0.0.1:${runtime.port}/v1/stores/entries`, {
    method,
    headers: { Authorization: `Bearer ${runtime.token}`, Origin: "http://127.0.0.1:1420", ...(value ? { "Content-Type": "application/json" } : {}) },
    body: value ? JSON.stringify(value) : undefined,
  });
  if (!response.ok) throw new Error(`${method} entries failed: ${await response.text()}`);
  return response.json();
}

function restartBridge(): Promise<ChildProcess> {
  const child = spawn(runtime.bridgeExecutable, ["--data-dir", runtime.dataDir, "--port", String(runtime.port), "--token", runtime.token], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRONG_ANSWER_STORAGE_DIR: runtime.dataDir, WRONG_ANSWER_STORAGE_TOKEN: runtime.token, WRONG_ANSWER_STORAGE_PORT: String(runtime.port) },
    windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("restarted bridge readiness timed out")), 30_000);
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
      if (/BRIDGE_READY/.test(output)) { clearTimeout(timer); resolve(child); }
    });
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", reject);
  });
}

test.describe.configure({ mode: "serial" });

test("shared desktop storage survives bridge restart and receives backend writes", async ({ page }) => {
  runtime = JSON.parse(await readFile("test-results/shared-bridge-runtime.json", "utf8")) as Runtime;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).not.toBeEmpty();

  const webEntry = { ...syntheticLifecycleEntry, id: "shared-web-entry", title: "Web에서 저장한 자료" };
  await page.evaluate(async ({ port, token, entry }) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/stores/entries`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([entry]),
    });
    if (!response.ok) throw new Error(await response.text());
  }, { port: runtime.port, token: runtime.token, entry: webEntry });

  const firstBridge = await requestStore("GET") as unknown[];
  expect(firstBridge).toHaveLength(1);
  expect((firstBridge[0] as { title: string }).title).toBe("Web에서 저장한 자료");

  process.kill(runtime.bridgePid);
  const restartedBridge = await restartBridge();
  const afterRestart = await requestStore("GET") as unknown[];
  expect((afterRestart[0] as { title: string }).title).toBe("Web에서 저장한 자료");

  const backendEntry = { ...syntheticLifecycleEntry, id: "shared-backend-entry", title: "백엔드에서 저장한 자료" };
  await requestStore("PUT", [webEntry, backendEntry]);
  await page.reload({ waitUntil: "domcontentloaded" });
  const visibleAfterBackendWrite = await page.evaluate(async ({ port, token }) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/stores/entries`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<Array<{ id: string }>>;
  }, { port: runtime.port, token: runtime.token });
  expect(visibleAfterBackendWrite.map((entry) => entry.id)).toEqual(["shared-web-entry", "shared-backend-entry"]);

  restartedBridge.kill();
});
