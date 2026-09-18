import type { ReviewItem, ReviewSession, ReviewSessionItemRef } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export function reviewItemKey(item: ReviewItem | ReviewSessionItemRef): string {
  const entryId = "entryId" in item ? item.entryId : item.entry.id;
  if (item.kind === "sheet-question") {
    return `sheet-question:${entryId}:${normalizeQuestionNumber(item.questionNumber)}`;
  }
  return `entry:${entryId}`;
}

export function reviewSessionFingerprint(mode: ReviewSession["mode"], items: Array<ReviewItem | ReviewSessionItemRef>): string {
  return `${mode}\u0000${items.map(reviewItemKey).join("\u0001")}`;
}

export function canResumeReviewSession(session: ReviewSession, mode: ReviewSession["mode"], items: ReviewItem[]): boolean {
  if (session.abandonedAt || session.completedAt || !session.seedFingerprint) return false;
  if (session.seedFingerprint !== reviewSessionFingerprint(mode, items)) return false;
  const itemKeys = new Set(items.map(reviewItemKey));
  const completedKeys = new Set([
    ...(session.completedItemKeys ?? []),
    ...(session.reviewEvents ?? []).map((event) => event.itemKey).filter((key): key is string => Boolean(key)),
  ]);
  const completedCount = [...completedKeys].filter((key) => itemKeys.has(key)).length;
  return completedCount > 0 && completedCount < items.length && session.currentIndex < items.length;
}

export function reviewSessionCompletedCount(session: ReviewSession, items: ReviewItem[]): number {
  const itemKeys = new Set(items.map(reviewItemKey));
  const completedKeys = new Set([
    ...(session.completedItemKeys ?? []),
    ...(session.reviewEvents ?? []).map((event) => event.itemKey).filter((key): key is string => Boolean(key)),
  ]);
  return [...completedKeys].filter((key) => itemKeys.has(key)).length;
}
