import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { getSheetResourceStatus } from "./getSheetResourceStatus";

const base = (answerKey: NonNullable<WrongAnswerEntry["answerKey"]>): WrongAnswerEntry => ({
  id: "sheet", subject: "수학", title: "문제지", question: "1. A\n2. B", questionImages: [], entryKind: "problem_sheet", difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], answerKey, supplementalResources: [{ id: "r", kind: "answer_key", title: "답지", createdAt: "2026-01-01", updatedAt: "2026-01-01" }], createdAt: "2026-01-01", updatedAt: "2026-01-01", mastered: false,
});

describe("getSheetResourceStatus", () => {
  it("counts answer, explanation, and supplemental history independently", () => {
    expect(getSheetResourceStatus(base([]))).toMatchObject({ questionCount: 2, answerCount: 0, explanationCount: 0, supplementalCount: 1, answerState: "none" });
    expect(getSheetResourceStatus(base([{ id: "1", questionNumber: "1", answer: "③", explanation: "", importantPoints: [] }]))).toMatchObject({ answerCount: 1, explanationCount: 0, answerState: "partial", explanationState: "none" });
    expect(getSheetResourceStatus(base([{ id: "1", questionNumber: "1", answer: "③", explanation: "풀이", importantPoints: [] }, { id: "2", questionNumber: "2", answer: "④", explanation: "풀이", importantPoints: [] }]))).toMatchObject({ answerCount: 2, explanationCount: 2, answerState: "complete", explanationState: "complete" });
  });
});
