import { describe, expect, it } from "vitest";
import { normalizeReviewState } from "./reviewNormalization";
import { normalizeQuestionReview } from "./questionMeta";
import { normalizeEntry } from "./entry";
import type { WrongAnswerEntry } from "../types";

describe("shared review normalization", () => {
  it("keeps question and entry normalization aligned while preserving phase policy", () => {
    const raw = {
      dueAt: null,
      intervalDays: 3,
      history: [{ id: "event-1", reviewedAt: "2026-01-01T00:00:00.000Z", result: "good", intervalDays: 3 }],
    };
    const question = normalizeQuestionReview(raw);
    const common = normalizeReviewState(raw, { defaultPhase: "learning" });
    expect(question).toEqual(common);
    expect(question?.phase).toBe("learning");

    const entry = normalizeEntry({
      id: "entry-review-phase",
      entryKind: "wrong_answer",
      title: "복습",
      question: "문제",
      mastered: true,
      review: raw,
    } as WrongAnswerEntry);
    expect(entry.review?.phase).toBe("archived");
  });
});
