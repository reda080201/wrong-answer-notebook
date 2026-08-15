import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { buildQuestionBankItems } from "./buildQuestionBankItems";

const duplicateSheet: WrongAnswerEntry = {
  id: "duplicate-sheet",
  subject: "수학",
  title: "중복 번호 자료",
  entryKind: "problem_sheet",
  question: "1. 첫 문제\n1번. 두 번째 문제",
  questionImages: [],
  answerKey: [],
  questionMeta: [],
  figures: [],
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  problemSource: { type: "self_made" },
  difficult: false,
  myAnswer: "",
  correctAnswer: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

describe("buildQuestionBankItems duplicate identity", () => {
  it("preserves the canonical number and gives duplicate rows occurrence-safe ids", () => {
    const items = buildQuestionBankItems([duplicateSheet]);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.questionNumber)).toEqual(["1", "1"]);
    expect(items.every((item) => item.duplicateQuestionNumber)).toBe(true);
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
  });
});
