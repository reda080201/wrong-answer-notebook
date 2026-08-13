import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { synchronizeDependencies } from "./dependency-sync.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const result = await synchronizeDependencies(root);
  console.log(result.installed
    ? "[dependency sync] dependency 동기화가 완료되었습니다."
    : "[dependency sync] 현재 dependency가 package-lock.json과 일치합니다.");
} catch (error) {
  console.error(`[오류] dependency 동기화에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
  console.error("[안내] 네트워크와 npm 설정을 확인한 뒤 프로젝트 폴더에서 npm ci를 실행하세요.");
  process.exitCode = 1;
}
