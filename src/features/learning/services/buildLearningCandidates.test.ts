import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { buildLearningCandidates, filterNewLearningCandidates } from "./buildLearningCandidates";

const entry: WrongAnswerEntry = {
  id: "sheet", subject: "수학", title: "시험지", question: "1. 문제", questionImages: [], entryKind: "problem_sheet", difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], createdAt: "2026-01-01", updatedAt: "2026-01-01", mastered: false,
  answerKey: [{ id: "a1", questionNumber: "1", answer: "③", explanation: "", strategy: "조건 정리", steps: ["식 세우기"], wrongPoint: "부호 혼동", reviewPoint: "부호 복습", importantPoints: [], concepts: ["함수"] }],
};

describe("buildLearningCandidates", () => {
  it("creates reviewable candidates without mutating the entry", () => {
    const candidates = buildLearningCandidates(entry);
    expect(candidates.map((item) => item.block.type)).toEqual(["concept", "routine", "routine", "warning", "review"]);
    expect(entry.learningBlocks).toBeUndefined();
    expect(candidates.every((item) => item.status === "draft")).toBe(true);
  });

  it("does not recreate an existing reviewed block", () => {
    const candidates = buildLearningCandidates({ ...entry, learningBlocks: [{ ...buildLearningCandidates(entry)[0].block, reviewStatus: "reviewed" }] });
    expect(filterNewLearningCandidates({ ...entry, learningBlocks: [{ ...candidates[0].block, reviewStatus: "reviewed" }] }, candidates)).toHaveLength(4);
  });
});
