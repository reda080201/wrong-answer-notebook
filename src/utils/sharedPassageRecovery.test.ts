import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../types";
import { createEmptyEntryDraft } from "../features/entries/model/entryDraft";
import { createExamSession } from "../features/exam/services/examSession";
import { wrongAnswerPresentation } from "../features/exam/services/wrongAnswerPresentation";
import { presentSessionSharedPassages, presentWrongAnswerSharedPassage } from "./sharedPassageRecovery";
import { getEntryQuestions } from "./entryQuestions";

const source: WrongAnswerEntry = { ...createEmptyEntryDraft("problem_sheet"), id: "source", title: "원본",
  question: "[1~2] 다음 조건\nx=2이다.\n\n1. 첫 문제\n① 1\n② 2\n\n2. 둘째 문제\n① 3\n② 4",
  createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z" };
function legacySession() {
  const session = createExamSession(source, new Date("2026-10-16T00:00:00Z"));
  return { ...session, questions: session.questions.map(question => ({ ...question, passage: undefined, stimulusGroupId: undefined })) };
}
describe("read-only legacy passage recovery", () => {
  it("recovers a uniquely matched unchanged source without modifying stored snapshots", () => {
    const session = legacySession(), before = structuredClone(session);
    const shown = presentSessionSharedPassages(session, [source]);
    expect(shown.questions[0].passage).toContain("x=2");
    expect(shown.questions[1].stimulusGroupId).toBe(shown.questions[0].stimulusGroupId);
    expect(session).toEqual(before);
  });
  it("refuses changed sources and duplicated normalized numbers", () => {
    const session = legacySession();
    const shown = presentSessionSharedPassages(session, [{ ...source, updatedAt: "2026-10-17T00:00:00Z" }]);
    expect(shown.questions[0].passage).toBeUndefined();
    expect(shown.questions[0].warning).toContain("원본 문제지");
    const duplicate = { ...session, questions: [...session.questions, { ...session.questions[0], id: "other", questionNumber: "01번" }] };
    expect(presentSessionSharedPassages(duplicate, [source]).questions[0].passage).toBeUndefined();
  });
  it("prepends the recovered passage to a legacy wrong answer but keeps its raw text and anchors intact", () => {
    const session = legacySession(), question = session.questions[0];
    const wrong: WrongAnswerEntry = { ...createEmptyEntryDraft("wrong_answer"), ...wrongAnswerPresentation(session, question),
      id: "wrong", title: "오답", question: `${question.question}\n${question.choices.join("\n")}`, createdAt: session.startedAt, updatedAt: session.startedAt,
      generatedFromExamSessionId: session.id, generatedFromQuestionNumber: "1",
      annotations: [{ id: "mark", target: "question", kind: "text", start: 0, end: 2, tool: "highlight" }] };
    const before = structuredClone(wrong);
    const shown = presentWrongAnswerSharedPassage(wrong, [session], [source]);
    expect(getEntryQuestions(shown)[0].contentSegments?.[0]).toMatchObject({ type: "text", text: expect.stringContaining("x=2") });
    expect(shown.question).toBe(wrong.question);
    expect(shown.annotations).toEqual(wrong.annotations);
    expect(wrong).toEqual(before);
  });
});
