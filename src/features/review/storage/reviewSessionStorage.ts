import type { ReviewSession } from "../../../types";

export const REVIEW_SESSIONS_STORAGE_KEY = "wrong-answer-review-sessions";

export function normalizeReviewSession(value: ReviewSession): ReviewSession {
  const refs = Array.isArray(value.itemRefs) ? value.itemRefs.filter((item) =>
    item && (item.kind === "entry" || item.kind === "sheet-question") && typeof item.entryId === "string" && item.entryId.trim(),
  ).map((item) => ({ ...item, questionNumber: item.questionNumber?.trim() || undefined })) : [];
  return {
    ...value,
    itemRefs: refs,
    currentIndex: Math.max(0, Math.min(Number.isInteger(value.currentIndex) ? value.currentIndex : 0, refs.length)),
    completedItemKeys: Array.isArray(value.completedItemKeys) ? [...new Set(value.completedItemKeys.filter((key): key is string => typeof key === "string"))] : [],
    reviewEvents: Array.isArray(value.reviewEvents) ? value.reviewEvents.filter((event) => event && typeof event === "object").map((event) => ({ ...event, itemKey: typeof event.itemKey === "string" ? event.itemKey : undefined })) : [],
    seedFingerprint: typeof value.seedFingerprint === "string" && value.seedFingerprint.trim() ? value.seedFingerprint : undefined,
  };
}

export function mergeReviewSession(sessions: ReviewSession[], session: ReviewSession): ReviewSession[] {
  return [...sessions.filter((item) => item.id !== session.id), normalizeReviewSession(session)];
}
