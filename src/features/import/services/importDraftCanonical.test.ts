import { describe, expect, it } from "vitest";
import type { StructuredQuestion, WrongAnswerEntry } from "../../../types";
import { createExamSession } from "../../exam/services/examSession";
import { buildChatGptSharePayload } from "../../export/services/buildChatGptSharePayload";
import { normalizeEntry } from "../../../utils/entry";
import { getEntryQuestions, renderStructuredQuestionsCompatibilityText } from "../../../utils/entryQuestions";
import { updateStructuredQuestionSegment } from "./structuredQuestionSegments";
import { getStructuredValidationFingerprint, removeFigureFromImportDraft } from "./importDraftCanonical";
import { canonicalizeImportDraftForSave } from "./importSavePolicy";

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
    id: "entry-1", subject: "수학", title: "구조화 문제지", entryKind: "problem_sheet",
    question: renderStructuredQuestionsCompatibilityText(structuredQuestions), structuredQuestions,
    questionImages: [], sourcePageImages: [], figures: [], answerKey: [], rejectedNotes,
    difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "", explanationParts: [],
    memo: "", annotations: [], tags: [], createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z", mastered: false,
  };
}

describe("structured import draft canonical helpers", () => {
  it("removes a figure from every canonical segment collection", () => {
    const result = removeFigureFromImportDraft({
      question: "1. before",
      figures: [{ id: "figure-1", questionNumber: "1", title: "그림", caption: "", source: "original", image: "figure.png", placement: { questionNumber: "1", afterSegmentId: "text-1" } }],
      structuredQuestions: [question],
      questionContentSegments: { 1: question.contentSegments },
    }, "figure-1");
    expect(result.figures).toEqual([]);
    expect(result.structuredQuestions?.[0].figureIds).toEqual([]);
    expect(result.questionContentSegments?.["1"]).toEqual([{ id: "text-1", type: "text", text: "before" }]);
  });

  it("uses issue content rather than a stale boolean for confirmation", () => {
    expect(getStructuredValidationFingerprint([{ id: "warning", severity: "warning", message: "first" }]))
      .not.toBe(getStructuredValidationFingerprint([{ id: "warning", severity: "warning", message: "second" }]));
  });

  it("round-trips a segment-aware edit into projection and exam creation", () => {
    const merged = updateStructuredQuestionSegment([question], {
      questionNumber: "1", segmentId: "text-1", value: "after",
    });
    const reloaded = normalizeEntry(entryWith(merged));
    expect(getEntryQuestions(reloaded)[0].questionText).toBe("after");
    expect(createExamSession(reloaded).questions[0].question).toBe("after");
  });

  it("keeps rejected notes out of canonical, exam, and export payloads", () => {
    const contaminated: StructuredQuestion = {
      ...question,
      questionText: "문제 학생 필기", conditions: ["조건 학생 필기"], equations: ["x=1 학생 필기"], choices: ["① 선택 학생 필기"],
      contentSegments: [{ id: "text", type: "text", text: "본문 학생 필기" }, { id: "table", type: "table", rows: [["셀 학생 필기"]] }],
      figureIds: [],
    };
    const reloaded = normalizeEntry(entryWith([contaminated], ["학생 필기"]));
    const payload = buildChatGptSharePayload({ entry: reloaded, questionNumbers: ["1"], scope: "selected", preferences: {
      shareQuestionText: true, shareChoices: true, shareQuestionImages: false, shareSourcePageImages: false,
      shareUserResponse: false, shareScratchNote: false, shareExistingAnswersAndExplanations: false,
    } });
    expect(JSON.stringify(reloaded.structuredQuestions)).not.toContain("학생 필기");
    expect(JSON.stringify(createExamSession(reloaded).questions)).not.toContain("학생 필기");
    expect(JSON.stringify(payload)).not.toContain("학생 필기");
  });

  it("scrubs rejected notes from legacy content segments before projection", () => {
    const saved = canonicalizeImportDraftForSave({
      question: "1. 문제",
      questionContentSegments: {
        "1": [
          { id: "text", type: "text", text: "본문 학생 필기" },
          { id: "condition", type: "condition", text: "조건 학생 필기", label: "메모" },
          { id: "equation", type: "equation", latex: "x=학생 필기", display: true },
          { id: "table", type: "table", rows: [["셀 학생 필기"]] },
        ],
      },
      rejectedNotes: ["학생 필기"],
    });
    const reloaded = normalizeEntry({
      ...entryWith([]),
      question: saved.question ?? "",
      questionContentSegments: saved.questionContentSegments,
    });
    expect(JSON.stringify(getEntryQuestions(reloaded))).not.toContain("학생 필기");
  });
});
