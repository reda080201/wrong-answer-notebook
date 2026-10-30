import type { AppSettings, IntegrityIssue, IntegrityReport, WrongAnswerEntry } from "../types";
import { getAllImageFilenames } from "./entry";
import { listBrowserImageKeys } from "../services/api/browserImageStore";
import { getBrowserProtectedImageReferences } from "../services/api/browserImageReferences";
import { getStorageBackendKind } from "../services/storageBackend";

interface ImageInventory { available: Set<string>; referenced: Set<string> }

export async function readClientImageInventory(entries: WrongAnswerEntry[]): Promise<ImageInventory> {
  if (getStorageBackendKind() !== "isolated-browser") {
    throw new Error("현재 저장 환경의 이미지 무결성 검사를 완료하지 못했습니다. 데스크톱 연결을 확인한 뒤 다시 검사하세요.");
  }
  const referenced = getBrowserProtectedImageReferences(entries, { reporting: true });
  return { available: new Set(await listBrowserImageKeys()), referenced };
}

function hasBadDate(value: string | undefined | null): boolean {
  return Boolean(value && Number.isNaN(new Date(value).getTime()));
}

export function runClientIntegrityCheck(
  entries: WrongAnswerEntry[],
  settings: AppSettings,
  inventory?: ImageInventory,
): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  const reportedMissing = new Set<string>();
  const referencedImages = inventory?.referenced ?? new Set(entries.flatMap(getAllImageFilenames));

  for (const entry of entries) {
    if (hasBadDate(entry.review?.dueAt) || hasBadDate(entry.review?.lastReviewedAt)) {
      issues.push({
        id: `bad-review-date-${entry.id}`,
        severity: "error",
        entryId: entry.id,
        message: `"${entry.title || "(제목 없음)"}" 항목의 복습 날짜가 깨져 있습니다.`,
      });
    }

    for (const filename of getAllImageFilenames(entry)) {
      if (inventory && !inventory.available.has(filename)) {
        reportedMissing.add(filename);
        issues.push({
          id: `missing-browser-image-${entry.id}-${filename}`,
          severity: "warning",
          entryId: entry.id,
          message: `"${entry.title || "(제목 없음)"}" 항목의 이미지가 누락되었습니다: ${filename}`,
        });
      }
    }
  }

  for (const filename of inventory?.referenced ?? []) {
    if (!inventory?.available.has(filename) && !reportedMissing.has(filename)) {
      issues.push({ id: `missing-referenced-image-${filename}`, severity: "warning", message: `저장된 시험·초안 등이 참조하는 이미지가 누락되었습니다: ${filename}` });
    }
  }

  for (const template of settings.templates) {
    const hasContent =
      template.name.trim() &&
      (template.data.title?.trim() ||
        template.data.question?.trim() ||
        template.data.memo?.trim());
    if (!hasContent) {
      issues.push({
        id: `empty-template-${template.id}`,
        severity: "warning",
        message: `"${template.name || "(이름 없음)"}" 템플릿이 비어 있습니다.`,
      });
    }
  }

  if (!inventory) issues.push({ id: "image-store-unchecked", severity: "warning", message: "이미지 저장소가 확인되지 않았습니다. 다시 검사하세요." });
  const localImageKeys = [...(inventory?.available ?? [])];
  const orphanCount = localImageKeys.filter((key) => !referencedImages.has(key)).length;
  if (orphanCount > 0) {
    issues.push({
      id: "orphan-browser-images",
      severity: "info",
      message: `사용하지 않는 브라우저 이미지 ${orphanCount}개가 있습니다.`,
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    issues,
  };
}
