import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const markers = ["127.0.0.1:7928", "X-Debug-Session-Id", "audit-pass1", "#region agent log", "agent log"];
const files = execFileSync("git", ["ls-files", "src", "src-tauri", ".github", "scripts"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((file) => file && file !== "scripts/check-no-debug-markers.mjs");
const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const marker of markers) {
    if (text.includes(marker)) hits.push(`${file}: ${marker}`);
  }
}
if (hits.length) {
  console.error("임시 디버그 marker가 제품 소스에 남아 있습니다.");
  console.error(hits.join("\n"));
  process.exit(1);
}
console.log("debug marker 검사 통과");
