import { describe, expect, it } from "vitest";
import { calculateNextReview } from "./reviewSchedule";

describe("reviewSchedule", () => {
  it("calculates next review interval by result", () => {
    const now = new Date("2026-05-29T00:00:00.000Z");

    expect(calculateNextReview(undefined, "again", now).intervalDays).toBe(1);
    expect(calculateNextReview(undefined, "hard", now).intervalDays).toBe(3);
    expect(calculateNextReview(undefined, "good", now).intervalDays).toBe(7);
  });

  it("applies cause multipliers when scheduling", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    const withCause = calculateNextReview(undefined, "good", now, "concept_gap");
    const withoutCause = calculateNextReview(undefined, "good", now);

    expect(withCause.stabilityDays).toBeLessThan(withoutCause.stabilityDays);
  });

  it("does not propagate an invalid previous review date", () => {
    const next = calculateNextReview(
      {
        dueAt: "2026-05-29T00:00:00.000Z",
        lastReviewedAt: "not-a-date",
        intervalDays: 7,
        streak: 1,
        history: [],
      },
      "good",
      new Date("2026-05-29T00:00:00.000Z"),
    );

    expect(Number.isFinite(next.stabilityDays)).toBe(true);
    expect(new Date(next.nextDueAt).toString()).not.toBe("Invalid Date");
  });

  it("loads without a circular dependency between review modules", async () => {
    await expect(import("./reviewSchedule")).resolves.toBeDefined();
    await expect(import("./questionMeta")).resolves.toBeDefined();
    await expect(import("./review")).resolves.toBeDefined();
  });
});
