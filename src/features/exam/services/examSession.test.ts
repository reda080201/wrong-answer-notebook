import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { createExamSession, publicExamQuestion, updateExamResponse } from "./examSession";
import { scoreExamSession } from "./examScoring";

const entry = {
  id: "sheet-1", subject: "수학", title: "모의고사", question: "1. 함수의 값은?\n① 1\n② 2", questionImages: [], entryKind: "problem_sheet", difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], answerKey: [{ id: "a1", questionNumber: "1", answer: "②", explanation: "해설", importantPoints: [] }], figures: [], mastered: false, createdAt: "", updatedAt: "",
} as WrongAnswerEntry;

describe("exam session foundation", () => {
  it("creates a snapshot that hides answers in public question payloads", () => {
    const session = createExamSession(entry);
    const payload = publicExamQuestion(session);
    expect(payload?.question.correctAnswer).toBeUndefined();
    expect(payload?.question.explanation).toBeUndefined();
  });

  it("scores submitted responses", () => {
    const session = updateExamResponse(createExamSession(entry), { questionNumber: "1", response: "②", scratchNote: "", markedForReview: false, updatedAt: "" });
    const score = scoreExamSession(session);
    expect(score.correctCount).toBe(1);
  });

  it("matches answer keys and figures using normalized question numbers", () => {
    const normalizedEntry = {
      ...entry,
      question: "10. 함수의 값은?\n① 1\n② 2",
      questionImages: ["problem.png"],
      figures: [{ id: "f1", questionNumber: "10번", title: "도표", caption: "", image: "figure.png", source: "original", needsReview: false }],
      answerKey: [{ id: "a10", questionNumber: "10.", answer: "②", explanation: "해설", importantPoints: [] }],
    } as WrongAnswerEntry;
    const session = createExamSession(normalizedEntry);
    expect(session.questions[0]?.correctAnswer).toBe("②");
    expect(session.questions[0]?.figures).toHaveLength(1);
    expect(session.questions[0]?.questionImages).toEqual(["problem.png"]);
  });
});
