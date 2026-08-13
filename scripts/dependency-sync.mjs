import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

export const INSTALL_STATE_VERSION = 1;
export const INSTALL_STATE_FILE = ".wrong-answer-notebook-install-state.json";
export const REQUIRED_FILES = [
  "node_modules/pretendard/package.json",
  "node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css",
];

export async function calculateDependencyFingerprint(root) {
  const hash = createHash("sha256");
  hash.update(`dependency-sync-v${INSTALL_STATE_VERSION}\0`);
  for (const filename of ["package.json", "package-lock.json"]) {
    hash.update(filename);
    hash.update("\0");
    hash.update(await readFile(path.join(root, filename)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

export async function inspectDependencyState(root, runtime = process) {
  const fingerprint = await calculateDependencyFingerprint(root);
  const nodeModules = path.join(root, "node_modules");
  const stampPath = path.join(nodeModules, INSTALL_STATE_FILE);
  const expected = {
    version: INSTALL_STATE_VERSION,
    fingerprint,
    nodeMajor: Number(runtime.versions.node.split(".")[0]),
    platform: runtime.platform,
    arch: runtime.arch,
  };

  if (!(await exists(nodeModules))) return { syncRequired: true, reason: "node_modules가 없습니다.", expected };

  let stamp;
  try {
    stamp = JSON.parse(await readFile(stampPath, "utf8"));
  } catch {
    return { syncRequired: true, reason: "dependency install stamp가 없거나 손상되었습니다.", expected };
  }

  for (const key of ["version", "fingerprint", "nodeMajor", "platform", "arch"]) {
    if (stamp[key] !== expected[key]) {
      return { syncRequired: true, reason: `${key} 설치 상태가 현재 프로젝트와 다릅니다.`, expected };
    }
  }

  for (const filename of REQUIRED_FILES) {
    if (!(await exists(path.join(root, filename)))) {
      return { syncRequired: true, reason: `필수 dependency 파일이 없습니다: ${filename}`, expected };
    }
  }

  return { syncRequired: false, expected };
}

export function runNpm(root, args, options = {}) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
    const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
    const child = spawn(command, commandArgs, {
      cwd: root,
      stdio: options.stdio ?? "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`npm ${args.join(" ")} 실패 (exit ${code})`)));
  });
}

export async function verifyDependencyTree(root, runner = runNpm) {
  await runner(root, ["ls", "--depth=0"], { stdio: "ignore" });
  for (const filename of REQUIRED_FILES) {
    if (!(await exists(path.join(root, filename)))) throw new Error(`필수 dependency 파일이 없습니다: ${filename}`);
  }
}

export async function writeInstallState(root, expected) {
  const nodeModules = path.join(root, "node_modules");
  await mkdir(nodeModules, { recursive: true });
  const target = path.join(nodeModules, INSTALL_STATE_FILE);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ ...expected, installedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export async function synchronizeDependencies(root, runner = runNpm) {
  let inspection = await inspectDependencyState(root);
  if (!inspection.syncRequired) {
    try {
      await verifyDependencyTree(root, runner);
      return { installed: false };
    } catch (error) {
      inspection = { ...inspection, syncRequired: true, reason: error.message };
    }
  }

  console.log(`[dependency sync] ${inspection.reason}`);
  console.log("[dependency sync] package-lock.json 기준으로 npm ci를 실행합니다.");
  await runner(root, ["ci"]);
  await verifyDependencyTree(root, runner);
  const expected = (await inspectDependencyStateWithoutStamp(root));
  await writeInstallState(root, expected);
  return { installed: true };
}

async function inspectDependencyStateWithoutStamp(root) {
  return {
    version: INSTALL_STATE_VERSION,
    fingerprint: await calculateDependencyFingerprint(root),
    nodeMajor: Number(process.versions.node.split(".")[0]),
    platform: process.platform,
    arch: process.arch,
  };
}
