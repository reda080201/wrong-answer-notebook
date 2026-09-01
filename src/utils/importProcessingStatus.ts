import type { ProcessingStatus } from "../types";

export interface ImportProcessingStatusInput {
  externalStatus?: ProcessingStatus;
  legacyNeedsReview?: boolean;
  localRejected?: boolean;
  localBlocking?: boolean;
  localNeedsReview?: boolean;
}

export type ImportDraftStatus = "ready" | "needs_review" | "invalid";

/**
 * Resolves usability at the import boundary. Local validation is deliberately
 * authoritative over claims supplied by an external package.
 */
export function resolveImportProcessingStatus({
  externalStatus,
  legacyNeedsReview,
  localRejected,
  localBlocking,
  localNeedsReview,
}: ImportProcessingStatusInput): ProcessingStatus {
  if (localRejected || localBlocking) return "rejected";
  if (localNeedsReview) return "needs_review";
  if (externalStatus === "rejected") return "rejected";
  if (externalStatus === "needs_review") return "needs_review";
  if (externalStatus === "ready") return "ready";
  return legacyNeedsReview ? "needs_review" : "ready";
}

/** Maps the richer persisted status to the review-workspace status vocabulary. */
export function toImportDraftStatus(status: ProcessingStatus): ImportDraftStatus {
  if (status === "rejected") return "invalid";
  return status;
}
