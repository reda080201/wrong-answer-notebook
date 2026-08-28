import { describe, expect, it } from "vitest";
import type { QuestionBankItem } from "../model/questionBankTypes";
import { selectQuestionBankItems, sortQuestionBankItems } from "./questionBankSelection";

const items = [1, 2, 3].map((number) => ({
  id: `entry:${number}`,
  entryId: "entry",
  entryTitle: "문제지",
  entryKind: "problem_sheet" as const,
  questionNumber: String(number),
  subject: "수학",
  questionText: `문제 ${number}`,
  source: { type: "unknown" as const },
  classification: { subject: "수학", sourceType: "unknown" as const, difficultyScore: number * 10, isPastExam: false },
  questionImages: [], sourcePageImages: [], hasAnswer: false, hasExplanation: false, hasImages: false,
  isWrong: false, isMastered: false, reviewDue: number === 2, updatedAt: `2026-01-0${number}T00:00:00.000Z`,
})) satisfies QuestionBankItem[];

describe("question bank selection", () => {
  it("uses a seed to select the same unlocked items deterministically", () => {
    expect(selectQuestionBankItems(items, 2, "same-seed").map((item) => item.id))
      .toEqual(selectQuestionBankItems(items, 2, "same-seed").map((item) => item.id));
  });

  it("sorts by canonical score and review state", () => {
    expect(sortQuestionBankItems(items, "difficulty")[0].questionNumber).toBe("3");
    expect(sortQuestionBankItems(items, "review_due")[0].questionNumber).toBe("2");
  });

  it("uses natural canonical question order as the equal-score tie breaker", () => {
    const tied = ["1", "10", "11", "2", "9"].map((questionNumber) => ({
      ...items[0], id: `entry:${questionNumber}`, questionNumber, updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    expect(sortQuestionBankItems(tied, "updated").map((item) => item.questionNumber)).toEqual(["1", "2", "9", "10", "11"]);
  });
});
