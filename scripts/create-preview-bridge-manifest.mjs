import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { calculateDevelopmentBridgeFingerprint } from "./development-runtime.mjs";

const [executable, output] = process.argv.slice(2);
if (!executable || !output) throw new Error("usage: node scripts/create-preview-bridge-manifest.mjs <executable> <manifest>");
const bytes = await readFile(executable);
const details = await stat(executable);
const manifest = {
  schemaVersion: 1,
  platform: "windows-x86_64",
  asset: path.basename(executable),
  fingerprint: await calculateDevelopmentBridgeFingerprint(process.cwd()),
  sha256: createHash("sha256").update(bytes).digest("hex"),
  size: details.size,
};
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest));
