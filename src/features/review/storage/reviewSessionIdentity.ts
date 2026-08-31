import type { ReviewItem, ReviewSessionItemRef } from "../../../models/review";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export function reviewItemKey(item: ReviewItem | ReviewSessionItemRef): string {
  if (item.kind === "sheet-question") {
    const entryId = "entry" in item ? item.entry.id : item.entryId;
    return `sheet-question:${entryId}:${normalizeQuestionNumber(item.questionNumber ?? "")}`;
  }
  return `entry:${"entry" in item ? item.entry.id : item.entryId}`;
}

export function reviewSeedFingerprint(mode: string, items: ReviewItem[] | ReviewSessionItemRef[]): string {
  return `${mode}:${items.map(reviewItemKey).join("|")}`;
}
