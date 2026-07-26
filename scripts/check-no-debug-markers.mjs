import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const forbidden = [
  "127.0.0.1:7928",
  "X-Debug-Session-Id",
  "audit-pass1",
  "#region agent log",
  "agent log",
];
const files = execFileSync("git", ["ls-files", "src", "src-tauri", ".github", "scripts"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((file) => file && file !== "scripts/check-no-debug-markers.mjs");
let failed = false;
for (const file of files) {
  const contents = readFileSync(file, "utf8");
  for (const marker of forbidden) {
    if (contents.includes(marker)) {
      console.error(`금지된 디버깅 마커 발견: ${file}: ${marker}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log("디버깅 마커 검사 통과");
