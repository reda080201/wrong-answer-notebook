import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { defaultBlueprintForPreset } from "../model/examBlueprint";
import { generateExam, questionQualityScore } from "./generateExam";

function sheet(id: string, body: string, score: number, important = false): WrongAnswerEntry {
  return {
    id, title: id, subject: "수학", entryKind: "problem_sheet", question: `1. ${body}\n① 가\n② 나`, questionImages: [], difficult: false, difficulty: "medium", difficultyScore: score, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [id], answerKey: [{ id: `${id}-a`, questionNumber: "1", answer: "①", explanation: "풀이", importantPoints: [], difficultyScore: score }], questionMeta: [{ questionNumber: "1", important, difficultyScore: score, updatedAt: "2026-01-01T00:00:00.000Z" }], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", mastered: false,
  };
}

describe("generateExam", () => {
  const entries = [sheet("a", "쉬운 고품질 문제", 25), sheet("b", "어려운 문제", 90, true), sheet("c", "다른 문제", 70)];
  it("is deterministic for the same seed and removes exact duplicate source questions", () => {
    const input = { entries, title: "세트", preset: "real_exam" as const, blueprint: defaultBlueprintForPreset("real_exam", 2), seed: "same" };
    const first = generateExam(input);
    const second = generateExam(input);
    expect(first.questions.map((item) => `${item.source.sourceEntryId}:${item.source.sourceQuestionNumber}`)).toEqual(second.questions.map((item) => `${item.source.sourceEntryId}:${item.source.sourceQuestionNumber}`));
    expect(new Set(first.questions.map((item) => item.source.sourceEntryId)).size).toBe(first.questions.length);
  });
  it("keeps locked questions during reassembly and reports a candidate shortage", () => {
    const locked = generateExam({ entries, title: "세트", preset: "hard", blueprint: defaultBlueprintForPreset("hard", 1), seed: "one" }).questions.map((item) => ({ ...item, locked: true }));
    const next = generateExam({ entries, title: "세트", preset: "hard", blueprint: defaultBlueprintForPreset("hard", 5), seed: "two", lockedQuestions: locked });
    expect(next.questions[0].source.sourceEntryId).toBe(locked[0].source.sourceEntryId);
    expect(next.generationReport.warnings).toHaveLength(1);
  });
  it("keeps quality independent from difficulty", () => {
    const easyHighQuality = questionQualityScore(entries[0], "1", entries[0].questionMeta?.[0]);
    const hardWithoutSolution = questionQualityScore({ ...entries[1], answerKey: [] }, "1", entries[1].questionMeta?.[0]);
    expect(easyHighQuality).toBeGreaterThan(70);
    expect(easyHighQuality).toBeGreaterThan(hardWithoutSolution);
  });
  it("preserves the unique structured source page and explicit crop page links in snapshots", () => {
    const source = {
      ...sheet("source-page", "페이지 연결 문제", 60),
      sourcePageImages: ["page-1.png", "page-2.png", "answer.png"],
      structuredQuestions: [{
        questionNumber: "1", questionText: "페이지 연결 문제", conditions: [], equations: [], choices: [], contentSegments: [], figureIds: [],
        source: { title: "원본", page: 2 },
      }],
      questionSourceCrops: [
        { id: "crop-page-2", questionNumber: "01번", image: "crop-2.png", page: 2, order: 0 },
        { id: "crop-page-1", questionNumber: "1", image: "crop-1.png", sourcePageImage: "page-1.png", order: 1 },
        { id: "bad-crop", questionNumber: "1", image: "crop-x.png", page: 9, order: 2 },
      ],
    } as WrongAnswerEntry;
    const generated = generateExam({ entries: [source], title: "페이지 연결", preset: "real_exam", blueprint: defaultBlueprintForPreset("real_exam", 1), seed: "page" });

    expect(generated.questions[0]?.snapshot.source).toEqual({ title: "원본", page: 2 });
    expect(generated.questions[0]?.snapshot.linkedSourcePageImages).toEqual(["page-2.png", "page-1.png"]);
  });

  it("hydrates explicit source pages for locked legacy snapshots without changing their content", () => {
    const source = {
      ...sheet("locked-source", "원문 본문", 60),
      sourcePageImages: ["p1.png", "p2.png"],
      structuredQuestions: [{ questionNumber: "1", questionText: "canonical 본문", conditions: [], equations: [], choices: [], contentSegments: [], figureIds: [], source: { page: 2 } }],
      questionSourceCrops: [{ questionNumber: "1", image: "crop.png", page: 1 }],
    } as WrongAnswerEntry;
    const locked = {
      position: 1,
      source: { sourceEntryId: source.id, sourceEntryTitle: source.title, sourceQuestionNumber: "1" },
      snapshot: { id: "locked", questionNumber: "1", question: "kept snapshot", choices: ["① kept choice"], questionImages: [], figures: [] },
      locked: true,
      selectionScore: 1,
      selectionReasons: [],
    };
    const generated = generateExam({ entries: [source], title: "locked", preset: "hard", blueprint: defaultBlueprintForPreset("hard", 1), seed: "locked", lockedQuestions: [locked] });
    expect(generated.questions[0].snapshot).toMatchObject({ question: "kept snapshot", choices: ["① kept choice"], source: { page: 2 }, linkedSourcePageImages: ["p1.png"] });
  });
});
