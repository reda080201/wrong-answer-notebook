import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { normalizeEntry } from "../../../utils/entry";
import { normalizeQuestionMeta } from "../../../utils/questionMeta";
import { buildQuestionBankItems } from "./buildQuestionBankItems";
import { filterQuestionBankItems } from "./filterQuestionBankItems";
import { DEFAULT_QUESTION_BANK_FILTERS } from "../model/questionBankTypes";

function sheet(): WrongAnswerEntry {
  return {
    id: "sheet-1", subject: "수학", title: "2027 6월 모의평가", entryKind: "problem_sheet",
    question: "1. 함수 f(x)의 값은?\n① 1\n② 2\n2. 미분 가능한 함수의 극값은?",
    questionImages: ["entry.png"], sourcePageImages: ["page-1.png"],
    problemSource: { type: "past_exam", examYear: 2027, examName: "6월 모의평가", isOfficial: true },
    difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: ["공통"],
    answerKey: [
      { id: "a1", questionNumber: "01", answer: "②", explanation: "함수값을 대입합니다.", importantPoints: [], concepts: ["함수"] },
      { id: "a2", questionNumber: "2번", answer: "극대 또는 극소", explanation: "도함수의 부호를 확인합니다.", importantPoints: [] },
    ],
    questionMeta: [
      { questionNumber: "1", important: true, difficultyScore: 82, rating: { importanceScore: 88, qualityScore: 91 }, classification: { unit: "함수", concepts: ["함수"], answerType: "multiple_choice", tags: ["대표"] }, updatedAt: "2026-01-01T00:00:00.000Z" },
      { questionNumber: "2", important: false, difficultyScore: 44, classification: { unit: "미분", sourceType: "n_series", answerType: "short_answer" }, updatedAt: "2026-01-01T00:00:00.000Z" },
    ],
    figures: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", mastered: false,
  };
}

describe("question bank projection", () => {
  it("projects each sheet question without duplicating its source entry", () => {
    const items = buildQuestionBankItems([sheet()]);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.id)).toEqual(["sheet-1:1", "sheet-1:2"]);
    expect(items[0]).toMatchObject({ entryId: "sheet-1", questionNumber: "1", answer: "②", hasExplanation: true, source: { type: "past_exam" } });
    expect(items[1].classification).toMatchObject({ unit: "미분", sourceType: "n_series", difficultyScore: 44 });
  });

  it("keeps score truth in question meta while normalizing classification fields", () => {
    const entry = normalizeEntry(sheet());
    expect(entry.questionMeta?.[0]?.difficultyScore).toBe(82);
    expect(entry.questionMeta?.[0]?.rating?.importanceScore).toBe(88);
    expect(entry.questionMeta?.[0]?.classification).toMatchObject({ unit: "함수", answerType: "multiple_choice" });
    expect(entry.problemSource).toMatchObject({ type: "past_exam", examYear: 2027 });
  });

  it("moves legacy duplicate classification scores into the canonical meta fields", () => {
    const [meta] = normalizeQuestionMeta([{
      questionNumber: "1",
      classification: { difficultyScore: 77, importanceScore: 85, qualityScore: 90, unit: "미분" },
    }] as unknown);
    expect(meta).toMatchObject({
      difficultyScore: 77,
      important: true,
      rating: { importanceScore: 85, qualityScore: 90 },
      classification: { unit: "미분" },
    });
  });

  it("combines source, unit, score, and answer filters", () => {
    const items = buildQuestionBankItems([sheet()]);
    const filtered = filterQuestionBankItems(items, {
      ...DEFAULT_QUESTION_BANK_FILTERS,
      sourceType: "past_exam",
      unit: "함수",
      minDifficulty: 80,
      minImportance: 80,
      answerState: "has",
    });
    expect(filtered.map((item) => item.id)).toEqual(["sheet-1:1"]);
  });
});
