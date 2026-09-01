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
  return Boolean(!session.completedAt && session.seedFingerprint && session.seedFingerprint === reviewSessionFingerprint(mode, items));
}
