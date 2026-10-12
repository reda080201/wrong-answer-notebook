import { describe, expect, it } from "vitest";
import type { ExamQuestionSnapshot, ExamSession, WrongAnswerEntry } from "../../../types";
import { wrongAnswerPresentation } from "./wrongAnswerPresentation";
import { createEmptyEntryDraft } from "../../entries/model/entryDraft";
import { entrySolutionQuestions } from "../../solutions/solutionModel";
import { createExamSession } from "./examSession";

const question: ExamQuestionSnapshot = {
  id: "q3", questionNumber: "3", question: "본문", choices: ["① 하나", "② 둘"],
  questionImages: [], sourcePageImages: ["second.png"], figures: [], source: { page: 2 },
  contentSegments: [
    { id: "before", type: "text", text: "본문" },
    { id: "condition", type: "condition", label: "(가)", text: "조건" },
    { id: "formula1", type: "equation", latex: "x^2", display: true },
    { id: "formula2", type: "equation", latex: "x^2", display: true },
  ], correctAnswer: "②", explanation: "해설",
};
const session: ExamSession = {
  id: "session", entryId: "sheet", title: "시험", subject: "수학", status: "submitted",
  sourcePageImages: ["first.png", "second.png"], sourcePageQuestionMap: { "second.png": ["3"] },
  questions: [question], responses: [], currentQuestionIndex: 0, startedAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z",
};
function asEntry(data: ReturnType<typeof wrongAnswerPresentation>): WrongAnswerEntry {
  return { ...createEmptyEntryDraft("wrong_answer"), ...data, question: "3. 본문\n① 하나\n② 둘", id: "wrong", title: "오답", createdAt: session.startedAt, updatedAt: session.updatedAt };
}

describe("submitted wrong-answer presentation", () => {
  it("retains multiple explicit pages without requiring artificial hotspots", () => {
    const multi = { ...session, sourcePageQuestionMap: { "first.png": ["3"], "second.png": ["3"] } };
    const data = wrongAnswerPresentation(multi, question);
    const entry = asEntry(data);
    expect(entrySolutionQuestions(entry)[0].sourcePages).toEqual(["first.png", "second.png"]);
    const reopened = createExamSession(entry);
    expect(reopened.sourcePageQuestionMap).toEqual({ "first.png": ["3"], "second.png": ["3"] });
    expect(data.questionSolutionHotspots).toEqual([]);
    expect(data.structuredQuestions?.[0].contentSegments).toEqual(question.contentSegments);
  });

  it("preserves an unlinked original without inventing a page association", () => {
    const unlinked = { ...question, source: undefined, sourcePageImages: ["first.png", "second.png"] };
    const data = wrongAnswerPresentation({ ...session, questions: [unlinked], sourcePageQuestionMap: {} }, unlinked);
    expect(data.sourcePageImages).toEqual(["first.png", "second.png"]);
    expect(entrySolutionQuestions(asEntry(data))[0].sourcePages).toEqual([]);
  });

  it("refuses ambiguous normalized question numbers and foreign hotspot keys", () => {
    const dotted = { ...question, questionSolutionHotspots: [{ id: "foreign", questionKey: "another-question", sourcePageImage: "second.png", x: 0.2, y: 0.3 }] };
    expect(wrongAnswerPresentation(session, dotted).questionSolutionHotspots).toEqual([]);
    const duplicated = { ...session, questions: [dotted, { ...dotted, id: "duplicate", questionNumber: "03번" }] };
    const data = wrongAnswerPresentation(duplicated, dotted);
    expect(data.answerKey).toEqual([]);
    expect(data.structuredQuestions?.[0].source?.page).toBeUndefined();
    expect(data.supplementalResources).toEqual([]);
  });

  it("copies solution figures and intent without mutating the snapshot", () => {
    const figure = { id: "solution-figure", questionNumber: "3", title: "해설 그림", caption: "", source: "original" as const, image: "solution.png" };
    const withSolution = { ...question, solutionFigures: [figure], solutionAnswer: { id: "answer", questionNumber: "3", answer: "②", explanation: "[FIGURE:solution-figure]", intent: "출제 의도", importantPoints: [] } };
    const data = wrongAnswerPresentation(session, withSolution);
    expect(data.figures).toEqual([figure]);
    expect(data.answerKey?.[0].intent).toBe("출제 의도");
    data.figures![0].image = "changed.png";
    expect(withSolution.solutionFigures[0].image).toBe("solution.png");
  });
});
