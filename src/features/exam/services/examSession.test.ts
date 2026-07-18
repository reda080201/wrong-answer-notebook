import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { createExamSession, publicExamQuestion, updateExamResponse } from "./examSession";
import { normalizeExamAnswer, scoreExamSession } from "./examScoring";

const entry = {
  id: "sheet-1", subject: "수학", title: "모의고사", question: "1. 함수의 값은?\n① 1\n② 2", questionImages: [], entryKind: "problem_sheet", difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], answerKey: [{ id: "a1", questionNumber: "1", answer: "②", explanation: "해설", importantPoints: [] }], figures: [], mastered: false, createdAt: "", updatedAt: "",
} as WrongAnswerEntry;

describe("exam session foundation", () => {
  it("creates a snapshot that hides answers in public question payloads", () => {
    const session = createExamSession(entry);
    const payload = publicExamQuestion(session);
    expect(payload?.question.correctAnswer).toBeUndefined();
    expect(payload?.question.explanation).toBeUndefined();
    expect(payload?.answerAvailable).toBe(false);
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
    expect(session.questions[0]?.questionImages).toEqual([]);
    expect(session.questions[0]?.sourcePageImages).toEqual(["problem.png"]);
  });

  it("normalizes common objective and numeric answer forms before scoring", () => {
    expect(normalizeExamAnswer("③")).toBe("3");
    expect(normalizeExamAnswer("3번")).toBe("3");
    expect(normalizeExamAnswer("024")).toBe("24");
    expect(normalizeExamAnswer("1, 3")).toBe("1,3");
    expect(normalizeExamAnswer("3,1")).toBe("1,3");
  });

  it("keeps a shared passage in every question snapshot", () => {
    const withPassage = {
      ...entry,
      question: "[자료]\n함수 f(x)의 성질을 이용한다.\n\n1. 첫 문제\n① 1\n② 2\n\n2. 둘째 문제\n① 3\n② 4",
    } as WrongAnswerEntry;
    const session = createExamSession(withPassage);
    expect(session.questions).toHaveLength(2);
    expect(session.questions[0]?.passage).toContain("함수 f(x)");
    expect(session.questions[1]?.passage).toContain("함수 f(x)");
  });

  it("assigns the latest stimulus to each question group", () => {
    const withMultipleStimuli = {
      ...entry,
      question: "[자료 A]\nA 자료\n\n1. 첫 문제\n① 1\n② 2\n\n2. 둘째 문제\n① 3\n② 4\n\n[자료 B]\nB 자료\n\n3. 셋째 문제\n① 5\n② 6\n\n4. 넷째 문제\n① 7\n② 8",
    } as WrongAnswerEntry;
    const session = createExamSession(withMultipleStimuli);
    expect(session.questions.map((item) => item.passage)).toEqual([
      "[자료 A]\nA 자료",
      "[자료 A]\nA 자료",
      "[자료 B]\nB 자료",
      "[자료 B]\nB 자료",
    ]);
    expect(session.questions[1]?.question).not.toContain("자료 B");
  });
});
