import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { createQuestionSource, formatQuestionSourceLabel, migrateQuestionSource } from "./questionSource";
import type { GeneratedExamQuestion } from "../../../types";

const entry = { id: "e1", title: "Alpha 모의고사 3회", subject: "수학", tags: ["미분"], entryKind: "problem_sheet", question: "13. 문제", questionImages: [], difficult: false, difficulty: "medium", myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], createdAt: "2026-01-01", updatedAt: "2026-01-01", mastered: false } as WrongAnswerEntry;

describe("question source", () => {
  it("formats the original title without duplicating round information", () => {
    expect(formatQuestionSourceLabel(createQuestionSource(entry, "13", { question: "문제", choices: [] }))).toBe("Alpha 모의고사 3회 13번");
  });
  it("migrates legacy flat fields into one source object", () => {
    const migrated = migrateQuestionSource({ position: 1, source: undefined as never, sourceEntryId: "e1", sourceQuestionNumber: "13", snapshot: { id: "q", questionNumber: "13", question: "문제", choices: [], questionImages: [], figures: [] }, locked: false, selectionScore: 1, selectionReasons: [] } as GeneratedExamQuestion, [entry]);
    expect(migrated.source.sourceEntryTitle).toBe("Alpha 모의고사 3회");
    expect(migrated.sourceQuestionNumber).toBeUndefined();
  });

  it("hydrates only explicit source-page and crop links for legacy snapshots without mutating stored data", () => {
    const sourceEntry = {
      ...entry,
      sourcePageImages: ["page-1.png", "page-2.png"],
      question: "1. 문제",
      structuredQuestions: [{ questionNumber: "1", questionText: "문제", choices: [], conditions: [], equations: [], contentSegments: [], figureIds: [], source: { page: 2 } }],
      questionSourceCrops: [{ questionNumber: "1", page: 1, image: "crop.png" }],
    } as WrongAnswerEntry;
    const snapshot = { id: "q", questionNumber: "1", question: "문제", choices: [], questionImages: [], figures: [] };
    const generated = { position: 1, source: { sourceEntryId: "e1", sourceEntryTitle: "Alpha", sourceQuestionNumber: "1" }, snapshot, locked: false, selectionScore: 1, selectionReasons: [] } as GeneratedExamQuestion;
    const normalized = migrateQuestionSource(generated, [sourceEntry]);
    expect(normalized.snapshot.source?.page).toBe(2);
    expect(normalized.snapshot.linkedSourcePageImages).toEqual(["page-1.png"]);
    expect(snapshot).not.toHaveProperty("source");
  });

  it("does not infer a page from sequence or ambiguous source questions", () => {
    const ambiguous = {
      ...entry,
      sourcePageImages: ["page-1.png", "page-2.png"],
      question: "1. 문제\n\n1. 문제 복제",
      structuredQuestions: [
        { questionNumber: "1", questionText: "문제", choices: [], conditions: [], equations: [], contentSegments: [], figureIds: [], source: { page: 1 } },
        { questionNumber: "1.", questionText: "문제 복제", choices: [], conditions: [], equations: [], contentSegments: [], figureIds: [], source: { page: 2 } },
      ],
    } as WrongAnswerEntry;
    const generated = { position: 1, source: { sourceEntryId: "e1", sourceEntryTitle: "Alpha", sourceQuestionNumber: "1" }, snapshot: { id: "q", questionNumber: "1", question: "문제", choices: [], questionImages: [], figures: [] }, locked: false, selectionScore: 1, selectionReasons: [] } as GeneratedExamQuestion;
    expect(migrateQuestionSource(generated, [ambiguous]).snapshot.source).toBeUndefined();
  });
});
