import { describe, expect, it } from "vitest";
import { reviewItemKey, reviewSeedFingerprint } from "./reviewSessionIdentity";

describe("review session identity", () => {
  it("keeps item kind and order in the seed", () => {
    const items = [{ kind: "entry" as const, entry: { id: "e1" } as never }, { kind: "sheet-question" as const, entry: { id: "e2" } as never, questionNumber: "09" }];
    expect(reviewItemKey(items[0])).toBe("entry:e1");
    expect(reviewItemKey(items[1])).toBe("sheet-question:e2:09");
    expect(reviewSeedFingerprint("today", items)).not.toBe(reviewSeedFingerprint("today", [...items].reverse()));
  });
});
