import { describe, expect, it } from "vitest";
import type { StructuredQuestion, WrongAnswerEntry } from "../../../types";
import { createExamSession } from "../../exam/services/examSession";
import { buildChatGptSharePayload } from "../../export/services/buildChatGptSharePayload";
import { normalizeEntry } from "../../../utils/entry";
import { getEntryQuestions, renderStructuredQuestionsCompatibilityText } from "../../../utils/entryQuestions";
import {
  getStructuredValidationFingerprint,
  mergeStructuredReviewTextIntoQuestions,
  removeFigureFromImportDraft,
  renderStructuredQuestionsReviewText,
} from "./importDraftCanonical";

const question: StructuredQuestion = {
  questionNumber: "1",
  questionType: "multiple_choice",
  questionText: "before",
  conditions: [],
  equations: ["x=1"],
  choices: ["① old"],
  contentSegments: [
    { id: "text-1", type: "text", text: "before" },
    { id: "figure-slot", type: "figure", figureId: "figure-1" },
  ],
  figureIds: ["figure-1"],
};

function entryWith(structuredQuestions: StructuredQuestion[], rejectedNotes: string[] = []): WrongAnswerEntry {
  return {
    id: "entry-1",
    subject: "수학",
    title: "구조화 문제지",
    entryKind: "problem_sheet",
    question: renderStructuredQuestionsCompatibilityText(structuredQuestions),
    structuredQuestions,
    questionImages: [],
    sourcePageImages: [],
    figures: [],
    answerKey: [],
    rejectedNotes,
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
}

describe("structured import draft canonical helpers", () => {
  it("edits only question text without duplicating conditions or equations", () => {
    const reviewQuestion: StructuredQuestion = {
      ...question,
      conditions: ["조건: x > 0"],
      equations: ["\\frac{1}{2}"],
      choices: ["① 1"],
      contentSegments: [
        { id: "question-text", type: "text", text: "before" },
        { id: "condition-1", type: "condition", label: "조건", text: "조건: x > 0" },
        { id: "equation-1", type: "equation", latex: "\\frac{1}{2}", display: true },
        { id: "table-1", type: "table", rows: [["표"]] },
        { id: "figure-1", type: "figure", figureId: "figure-1" },
      ],
    };
    const rendered = renderStructuredQuestionsReviewText([reviewQuestion]);
    const result = mergeStructuredReviewTextIntoQuestions([reviewQuestion], rendered.replace("before", "after"));

    expect(result.error).toBeUndefined();
    expect(result.questions?.[0]).toMatchObject({
      questionText: "after",
      conditions: ["조건: x > 0"],
      equations: ["\\frac{1}{2}"],
      choices: ["① 1"],
    });
    expect(result.questions?.[0].contentSegments.map((segment) => segment.id)).toEqual([
      "question-text",
      "condition-1",
      "equation-1",
      "table-1",
      "figure-1",
    ]);
    expect(result.questions?.[0].contentSegments[3]).toEqual({ id: "table-1", type: "table", rows: [["표"]] });
    expect(result.questions?.[0].contentSegments[4]).toEqual({ id: "figure-1", type: "figure", figureId: "figure-1" });
  });

  it("keeps repeated review render and merge lossless", () => {
    const reviewQuestion: StructuredQuestion = {
      ...question,
      conditions: ["조건: x > 0"],
      equations: ["x = 1"],
      choices: ["① 1", "② 2"],
      contentSegments: [{ id: "text-1", type: "text", text: "before" }],
    };
    const first = mergeStructuredReviewTextIntoQuestions(
      [reviewQuestion],
      renderStructuredQuestionsReviewText([reviewQuestion]),
    ).questions!;
    const second = mergeStructuredReviewTextIntoQuestions(
      first,
      renderStructuredQuestionsReviewText(first),
    ).questions!;

    expect(second[0].questionText).toBe("before");
    expect(second[0].conditions).toEqual(["조건: x > 0"]);
    expect(second[0].equations).toEqual(["x = 1"]);
    expect(second[0].choices).toEqual(["① 1", "② 2"]);
  });

  it("escapes marker-like user content without confusing it with document delimiters", () => {
    const markerQuestion: StructuredQuestion = {
      ...question,
      questionText: "before\n@@TEXT는 본문입니다.",
      conditions: ["@@ITEM 조건"],
      equations: ["\\@@수식"],
      choices: ["① @@END_QUESTION 선택지"],
    };

    const rendered = renderStructuredQuestionsReviewText([markerQuestion]);
    const merged = mergeStructuredReviewTextIntoQuestions([markerQuestion], rendered).questions;

    expect(merged?.[0]).toMatchObject({
      questionText: markerQuestion.questionText,
      conditions: markerQuestion.conditions,
      equations: markerQuestion.equations,
      choices: markerQuestion.choices,
    });
  });

  it("rejects damaged review delimiters and changed question sets", () => {
    const rendered = renderStructuredQuestionsReviewText([question]);
    expect(mergeStructuredReviewTextIntoQuestions([question], rendered.replace("@@END_TEXT", "@@END_TEXT_BROKEN")).error).toMatch(/본문/);
    expect(mergeStructuredReviewTextIntoQuestions([question], rendered.replace("@@QUESTION 1", "@@QUESTION 2")).error).toMatch(/추가하거나 삭제/);
    expect(mergeStructuredReviewTextIntoQuestions([question], rendered.replace("@@END_QUESTION", "@@QUESTION 1\n@@END_QUESTION")).error).toMatch(/문항 시작|종료|번호/);
  });

  it("merges reviewed compatibility text without moving figure segments", () => {
    const rendered = renderStructuredQuestionsReviewText([question]);
    const result = mergeStructuredReviewTextIntoQuestions([question], rendered.replace("before", "after").replace("① old", "① new"));
    expect(result.error).toBeUndefined();
    expect(result.questions?.[0].questionText).toBe("after");
    expect(result.questions?.[0].choices).toEqual(["① new"]);
    expect(result.questions?.[0].contentSegments.map((segment) => segment.id)).toEqual(["text-1", "review-1-equation-1", "figure-slot"]);
  });

  it("rejects changed or duplicate question numbers", () => {
    const rendered = renderStructuredQuestionsReviewText([question]);
    expect(mergeStructuredReviewTextIntoQuestions([question], rendered.replace("@@QUESTION 1", "@@QUESTION 2")).error).toMatch(/추가하거나 삭제/);
    expect(mergeStructuredReviewTextIntoQuestions([question], `${rendered}\n\n${rendered}`).error).toMatch(/중복/);
  });

  it("removes a figure from every canonical segment collection", () => {
    const result = removeFigureFromImportDraft({
      question: "1. before",
      figures: [{ id: "figure-1", questionNumber: "1", title: "그림", caption: "", source: "original", image: "figure.png", placement: { questionNumber: "1", afterSegmentId: "text-1" } }],
      structuredQuestions: [question],
      questionContentSegments: { 1: question.contentSegments },
    }, "figure-1");
    expect(result.figures).toEqual([]);
    expect(result.structuredQuestions?.[0].figureIds).toEqual([]);
    expect(result.structuredQuestions?.[0].contentSegments).toEqual([{ id: "text-1", type: "text", text: "before" }]);
    expect(result.questionContentSegments?.["1"]).toEqual([{ id: "text-1", type: "text", text: "before" }]);
  });

  it("uses issue content rather than a stale boolean for confirmation", () => {
    const first = getStructuredValidationFingerprint([{ id: "warning", severity: "warning", message: "first" }]);
    const second = getStructuredValidationFingerprint([{ id: "warning", severity: "warning", message: "second" }]);
    expect(first).not.toBe(second);
  });

  it("round-trips a reviewed canonical question into projection and exam creation", () => {
    const rendered = renderStructuredQuestionsReviewText([question]);
    const merged = mergeStructuredReviewTextIntoQuestions([question], rendered.replace("before", "after").replace("① old", "① new")).questions!;
    const reloaded = normalizeEntry(entryWith(merged));
    expect(getEntryQuestions(reloaded)[0].questionText).toBe("after");
    expect(createExamSession(reloaded).questions[0].question).toBe("after");
  });

  it("keeps rejected notes out of canonical, exam, and export payloads", () => {
    const contaminated: StructuredQuestion = {
      ...question,
      questionText: "문제 학생 필기",
      conditions: ["조건 학생 필기"],
      equations: ["x=1 학생 필기"],
      choices: ["① 선택 학생 필기"],
      contentSegments: [
        { id: "text", type: "text", text: "본문 학생 필기" },
        { id: "table", type: "table", rows: [["셀 학생 필기"]] },
      ],
      figureIds: [],
    };
    const reloaded = normalizeEntry(entryWith([contaminated], ["학생 필기"]));
    const exam = createExamSession(reloaded);
    const payload = buildChatGptSharePayload({
      entry: reloaded,
      questionNumbers: ["1"],
      scope: "selected",
      preferences: {
        shareQuestionText: true,
        shareChoices: true,
        shareQuestionImages: false,
        shareSourcePageImages: false,
        shareUserResponse: false,
        shareScratchNote: false,
        shareExistingAnswersAndExplanations: false,
      },
    });
    expect(JSON.stringify(reloaded.structuredQuestions)).not.toContain("학생 필기");
    expect(JSON.stringify(exam.questions)).not.toContain("학생 필기");
    expect(JSON.stringify(payload)).not.toContain("학생 필기");
  });
});
