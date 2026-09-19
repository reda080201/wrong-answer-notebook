import { describe, expect, it } from "vitest";
import type { ReviewItem, ReviewSession } from "../../../types";
import { canResumeReviewSession, reviewSessionFingerprint, reviewSessionCompletedCount } from "./reviewSessionIdentity";

const entry = (id: string): ReviewItem => ({ kind: "entry", entry: { id } } as ReviewItem);

function session(items: ReviewItem[], completedItemKeys: string[], overrides: Partial<ReviewSession> = {}): ReviewSession {
  return {
    id: "session-old",
    mode: "selection",
    seedFingerprint: reviewSessionFingerprint("selection", items),
    itemRefs: items.map((item) => ({ kind: "entry", entryId: item.entry.id })),
    currentIndex: completedItemKeys.length,
    completedItemKeys,
    reviewEvents: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("review session resume identity", () => {
  it("only resumes a matching session with partial completed items", () => {
    const items = [entry("a"), entry("b"), entry("c")];
    const keys = ["entry:a"];
    expect(reviewSessionCompletedCount(session(items, keys), items)).toBe(1);
    expect(canResumeReviewSession(session(items, keys), "selection", items)).toBe(true);
    expect(canResumeReviewSession(session(items, []), "selection", items)).toBe(false);
    expect(canResumeReviewSession(session(items, ["entry:a", "entry:b", "entry:c"]), "selection", items)).toBe(false);
  });

  it("never resumes an abandoned or stale session", () => {
    const items = [entry("a"), entry("b")];
    expect(canResumeReviewSession(session(items, ["entry:a"], { abandonedAt: "2026-01-02T00:00:00.000Z" }), "selection", items)).toBe(false);
    expect(canResumeReviewSession(session(items, ["entry:a"], { seedFingerprint: "stale" }), "selection", items)).toBe(false);
  });
});
