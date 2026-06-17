import type { AppSettings, IntegrityIssue, IntegrityReport, WrongAnswerEntry } from "../types";
import { getAllImageFilenames } from "./entry";

function hasBadDate(value: string | undefined | null): boolean {
  return Boolean(value && Number.isNaN(new Date(value).getTime()));
}

export function runClientIntegrityCheck(
  entries: WrongAnswerEntry[],
  settings: AppSettings,
): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  const referencedImages = new Set(entries.flatMap(getAllImageFilenames));

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
      if (filename.startsWith("img_") && !localStorage.getItem(filename)) {
        issues.push({
          id: `missing-browser-image-${entry.id}-${filename}`,
          severity: "warning",
          entryId: entry.id,
          message: `"${entry.title || "(제목 없음)"}" 항목의 브라우저 이미지가 누락되었습니다.`,
        });
      }
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

  const localImageKeys = Object.keys(localStorage).filter((key) => key.startsWith("img_"));
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
