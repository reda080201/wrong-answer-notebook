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
});
