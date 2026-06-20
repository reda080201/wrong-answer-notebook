import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../types";
import { getAllImageFilenames, normalizeEntry } from "./entry";

function rawEntry(partial: Partial<WrongAnswerEntry> = {}): WrongAnswerEntry {
  return {
    id: "1",
    subject: "수학",
    title: "",
    question: "대표 제목\n본문",
    questionImages: [],
    entryKind: "wrong_answer",
    difficult: true,
    difficulty: undefined,
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [],
    memo: "",
    annotations: [],
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    mastered: false,
    ...partial,
  };
}

describe("normalizeEntry", () => {
  it("migrates legacy explanation and image fields", () => {
    const entry = normalizeEntry(
      rawEntry({
        explanation: "legacy explanation",
        explanationImages: ["exp.png"],
        images: ["question.png"],
      }),
    );

    expect(entry.title).toBe("대표 제목");
    expect(entry.question).toBe("본문");
    expect(entry.questionImages).toEqual(["question.png"]);
    expect(entry.explanationParts).toEqual([
      {
        id: "migrated-legacy",
        text: "legacy explanation",
        images: ["exp.png"],
      },
    ]);
  });

  it("normalizes invalid difficulty from the difficult flag", () => {
    const entry = normalizeEntry(
      rawEntry({ difficulty: "invalid" as WrongAnswerEntry["difficulty"] }),
    );

    expect(entry.difficulty).toBe("high");
  });

  it("migrates missing figures to an empty list and includes figure images in references", () => {
    const entry = normalizeEntry(
      rawEntry({
        entryKind: "problem_sheet",
        figures: [
          {
            id: "fig-1",
            questionNumber: "1",
            title: "그래프",
            caption: "교점 그래프",
            image: "graph_1.png",
            source: "gpt_cleaned",
          },
        ],
      }),
    );

    expect(normalizeEntry(rawEntry()).figures).toEqual([]);
    expect(entry.figures?.[0]).toEqual(
      expect.objectContaining({
        questionNumber: "1",
        image: "graph_1.png",
      }),
    );
    expect(getAllImageFilenames(entry)).toContain("graph_1.png");
  });

  it("normalizes persisted import audit and rejected notes", () => {
    const entry = normalizeEntry(rawEntry({
      entryKind: "problem_sheet",
      question: "01. 첫 문제",
      importAudit: {
        expectedQuestionNumbers: ["01", "2번"],
        detectedQuestionNumbers: [],
        missingQuestionNumbers: [],
        uncertainQuestionNumbers: ["#2"],
        handwritingExcluded: true,
        needsReviewCount: 0,
      },
      rejectedNotes: [" 학생 계산 ", "학생 계산"],
    }));

    expect(entry.importAudit).toEqual(expect.objectContaining({
      expectedQuestionNumbers: ["1", "2"],
      detectedQuestionNumbers: ["1"],
      missingQuestionNumbers: ["2"],
      uncertainQuestionNumbers: ["2"],
    }));
    expect(entry.rejectedNotes).toEqual(["학생 계산"]);
  });
});
