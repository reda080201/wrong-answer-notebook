import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../types";
import { getNextStudyAction } from "./nextStudyAction";

const entry: WrongAnswerEntry = {
  id: "entry-1",
  subject: "수학",
  title: "문제",
  question: "1. 문제",
  questionImages: [],
  entryKind: "problem_sheet",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

const state = {
  isSheet: true,
  hasNextQuestion: false,
  hideAnswers: false,
  focusModeClosed: true,
  canGenerateSolution: true,
  canGenerateLearning: true,
  theaterModeClosed: true,
};

describe("getNextStudyAction", () => {
  it("prioritizes blocking audit and rejected handwriting review", () => {
    expect(getNextStudyAction({
      ...entry,
      importAudit: {
        expectedQuestionNumbers: ["1", "2"],
        detectedQuestionNumbers: ["1"],
        missingQuestionNumbers: ["2"],
        uncertainQuestionNumbers: [],
        handwritingExcluded: true,
        needsReviewCount: 0,
      },
    }, state).id).toBe("review-missing");

    expect(getNextStudyAction({ ...entry, rejectedNotes: ["학생 필기"] }, state).id).toBe("review-rejected-notes");
  });

  it("moves from solution generation to learning generation and focus", () => {
    expect(getNextStudyAction(entry, state).id).toBe("generate-solution");
    expect(getNextStudyAction({
      ...entry,
      answerKey: [{ id: "a", questionNumber: "1", answer: "③", explanation: "풀이", importantPoints: [] }],
    }, state).id).toBe("generate-learning");
    expect(getNextStudyAction({
      ...entry,
      answerKey: [{ id: "a", questionNumber: "1", answer: "③", explanation: "풀이", importantPoints: [] }],
      learningBlocks: [{ id: "b", type: "concept", title: "개념", content: "함수" }],
    }, state).id).toBe("start-focus");
  });

  it("falls back to answer, next question, and review actions", () => {
    expect(getNextStudyAction(entry, { ...state, canGenerateSolution: false, canGenerateLearning: false, focusModeClosed: false, theaterModeClosed: false, hideAnswers: true }).id).toBe("show-answer");
    expect(getNextStudyAction(entry, { ...state, canGenerateSolution: false, canGenerateLearning: false, focusModeClosed: false, theaterModeClosed: false, hasNextQuestion: true }).id).toBe("next-question");
    expect(getNextStudyAction({ ...entry, subject: "국어" }, { ...state, canGenerateSolution: false, canGenerateLearning: false, focusModeClosed: false, theaterModeClosed: false }).id).toBe("record-good");
  });
});
