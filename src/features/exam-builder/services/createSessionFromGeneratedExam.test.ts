import { describe, expect, it } from "vitest";
import type { GeneratedExam } from "../../../types";
import { createSessionFromGeneratedExam } from "./createSessionFromGeneratedExam";
import { updateExamResponse } from "../../exam/services/examSession";
import { scoreExamSession } from "../../exam/services/examScoring";

describe("createSessionFromGeneratedExam", () => {
  it("maps explicit source pages to generated positions and does not guess a lone unlinked page", () => {
    const exam = {
      id: "page-links", title: "페이지 연결", subject: "수학", preset: "random", createdAt: "", updatedAt: "", seed: "s", status: "ready", generationReport: {},
      questions: [
        { position: 1, source: { sourceEntryId: "sheet-a", sourceQuestionNumber: "1" }, snapshot: { id: "a-1", questionNumber: "1", question: "A", choices: [], questionImages: [], sourcePageImages: ["a-1.png", "a-2.png"], source: { page: 2 }, linkedSourcePageImages: ["a-1.png", "a-2.png", "a-2.png"], figures: [{ id: "g", questionNumber: "1", title: "", caption: "", image: "graph.png", source: "original", original: { image: "graph.png", sourcePageImage: "a-3.png" } }] }, locked: true, selectionScore: 1, selectionReasons: [] },
        { position: 2, source: { sourceEntryId: "sheet-b", sourceQuestionNumber: "1" }, snapshot: { id: "b-1", questionNumber: "1", question: "B", choices: [], questionImages: [], sourcePageImages: ["b-only.png"], figures: [] }, locked: true, selectionScore: 1, selectionReasons: [] },
      ],
    } as unknown as GeneratedExam;

    const session = createSessionFromGeneratedExam(exam, new Date("2026-01-01T00:00:00.000Z"), { mode: "real" });
    expect(session.sourcePageQuestionMap).toEqual({ "a-1.png": ["1"], "a-2.png": ["1"], "a-3.png": ["1"] });
    expect(session.selectedSourcePageImages).toEqual(["a-1.png", "a-2.png", "a-3.png"]);
    expect(session.questions.map((question) => question.questionNumber)).toEqual(["1", "2"]);
    expect(session.sourcePageQuestionMap?.["b-only.png"]).toBeUndefined();
  });

  it("gives questions from different sheets distinct response and scoring numbers", () => {
    const exam = {
      id: "mixed-sheets",
      title: "두 문제지 시험",
      subject: "수학",
      preset: "random",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      seed: "seed",
      status: "ready",
      generationReport: {},
      questions: [
        {
          position: 1,
          source: { sourceEntryId: "sheet-a", sourceQuestionNumber: "1" },
          snapshot: { id: "sheet-a-1", questionNumber: "1", question: "A", choices: [], questionImages: [], figures: [], correctAnswer: "1" },
        },
        {
          position: 2,
          source: { sourceEntryId: "sheet-b", sourceQuestionNumber: "1" },
          snapshot: { id: "sheet-b-1", questionNumber: "1", question: "B", choices: [], questionImages: [], figures: [], correctAnswer: "2" },
        },
      ],
    } as unknown as GeneratedExam;

    const session = createSessionFromGeneratedExam(exam);
    expect(session.questions.map((question) => question.questionNumber)).toEqual(["1", "2"]);
    expect(session.questions.map((question) => question.sourceQuestionNumber)).toEqual(["1", "1"]);

    const answered = updateExamResponse(
      updateExamResponse(session, { questionNumber: "1", response: "1", scratchNote: "", markedForReview: false, updatedAt: "" }),
      { questionNumber: "2", response: "2", scratchNote: "", markedForReview: false, updatedAt: "" },
    );
    expect(answered.responses).toHaveLength(2);
    expect(scoreExamSession(answered).correctCount).toBe(2);
  });
});
