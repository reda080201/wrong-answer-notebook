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
});
