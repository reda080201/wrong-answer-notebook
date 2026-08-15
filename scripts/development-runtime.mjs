import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const FINGERPRINT_INPUTS = ["package.json", "package-lock.json", "src", "src-tauri/src", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/build.rs"];

async function collectFiles(root, relativePath) {
  const target = path.join(root, relativePath);
  const details = await stat(target);
  if (details.isFile()) return [relativePath];
  if (!details.isDirectory()) return [];
  const children = await readdir(target, { withFileTypes: true });
  const files = [];
  for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
    if (child.isFile() || child.isDirectory()) files.push(...await collectFiles(root, path.join(relativePath, child.name)));
  }
  return files;
}

export async function calculateDevelopmentBridgeFingerprint(root) {
  const hash = createHash("sha256");
  hash.update("development-storage-bridge-v1\0");
  const files = [];
  for (const input of FINGERPRINT_INPUTS) files.push(...await collectFiles(root, input));
  for (const filename of files.sort()) {
    hash.update(filename.replaceAll(path.sep, "/"));
    hash.update("\0");
    hash.update(await readFile(path.join(root, filename)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function developmentCargoTargetDir(environment = process.env, platform = process.platform) {
  if (environment.CARGO_TARGET_DIR) return environment.CARGO_TARGET_DIR;
  if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA || path.join(environment.USERPROFILE || process.cwd(), "AppData", "Local");
    return path.join(localAppData, "WrongAnswerNotebookDev", "cargo-target");
  }
  return path.join(environment.HOME || process.cwd(), ".cache", "WrongAnswerNotebookDev", "cargo-target");
}
