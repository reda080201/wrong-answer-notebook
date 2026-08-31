import { describe, expect, it } from "vitest";
import { canResumeReviewSession, reviewItemKey, reviewSeedFingerprint } from "./reviewSessionIdentity";

describe("review session identity", () => {
  it("keeps item kind and order in the seed", () => {
    const items = [{ kind: "entry" as const, entry: { id: "e1" } as never }, { kind: "sheet-question" as const, entry: { id: "e2" } as never, questionNumber: "09" }];
    expect(reviewItemKey(items[0])).toBe("entry:e1");
    expect(reviewItemKey(items[1])).toBe("sheet-question:e2:9");
    expect(reviewSeedFingerprint("today", items)).not.toBe(reviewSeedFingerprint("today", [...items].reverse()));
  });

  it("only resumes an incomplete session with an exact ordered seed", () => {
    const items = [{ kind: "entry" as const, entry: { id: "e1" } as never }, { kind: "entry" as const, entry: { id: "e2" } as never }];
    const session = {
      id: "s1", mode: "today" as const, itemRefs: [{ kind: "entry" as const, entryId: "e1" }, { kind: "entry" as const, entryId: "e2" }],
      currentIndex: 1, completedItemKeys: [], reviewEvents: [], createdAt: "", updatedAt: "",
      seedFingerprint: reviewSeedFingerprint("today", items),
    };
    expect(canResumeReviewSession(session, "today", items)).toBe(true);
    expect(canResumeReviewSession(session, "today", [items[1], items[0]])).toBe(false);
    expect(canResumeReviewSession(session, "today", [items[0]])).toBe(false);
    expect(canResumeReviewSession({ ...session, seedFingerprint: undefined }, "today", items)).toBe(false);
  });
});
