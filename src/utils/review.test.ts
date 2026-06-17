import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../types";
import {
  applyReviewResult,
  calculateNextReview,
  getDifficultReviewCandidates,
  getTodayReviewCandidates,
} from "./review";

const baseEntry: WrongAnswerEntry = {
  id: "1",
  subject: "수학",
  title: "문제",
  question: "1+1",
  questionImages: [],
  entryKind: "wrong_answer",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "2",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

describe("review utilities", () => {
  it("calculates next review interval by result", () => {
    const now = new Date("2026-05-29T00:00:00.000Z");

    expect(calculateNextReview(undefined, "again", now).intervalDays).toBe(1);
    expect(calculateNextReview(undefined, "hard", now).intervalDays).toBe(3);
    expect(calculateNextReview(undefined, "good", now).intervalDays).toBe(7);
  });

  it("promotes good streaks and marks long interval as mastered", () => {
    const reviewed = applyReviewResult(
      {
        ...baseEntry,
        review: {
          dueAt: "2026-05-29T00:00:00.000Z",
          intervalDays: 14,
          streak: 2,
          history: [],
        },
      },
      "good",
      new Date("2026-05-29T00:00:00.000Z"),
    );

    expect(reviewed.review?.intervalDays).toBe(30);
    expect(reviewed.mastered).toBe(true);
    expect(reviewed.review?.history).toHaveLength(1);
  });

  it("filters due and difficult candidates", () => {
    const now = new Date("2026-05-29T12:00:00.000Z");
    const future = {
      ...baseEntry,
      id: "future",
      review: {
        dueAt: "2026-06-01T00:00:00.000Z",
        intervalDays: 7,
        streak: 1,
        history: [],
      },
    };
    const difficult = { ...baseEntry, id: "hard", difficult: true };

    expect(getTodayReviewCandidates([baseEntry, future], now).map((entry) => entry.id)).toEqual(["1"]);
    expect(getDifficultReviewCandidates([baseEntry, difficult]).map((entry) => entry.id)).toEqual(["hard"]);
  });
});
