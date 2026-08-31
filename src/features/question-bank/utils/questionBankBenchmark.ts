import type { QuestionBankItem } from "../model/questionBankTypes";
import { filterQuestionBankItems } from "./filterQuestionBankItems";
import { groupQuestionBankItems } from "./questionBankGrouping";

export interface QuestionBankBenchmarkResult {
  size: number;
  durationMs: number;
  matched: number;
}

export function createQuestionBankBenchmarkItems(size: number): QuestionBankItem[] {
  return Array.from({ length: size }, (_, index) => ({
    id: `benchmark:${index + 1}`,
    entryId: `entry-${Math.floor(index / 10)}`,
    questionNumber: String(index + 1),
    entryTitle: `미분과 적분 연습 ${index + 1}`,
    questionText: `f(x)의 극값을 구하시오 ${index + 1}`,
    subject: index % 2 ? "수학" : "국어",
    classification: { importanceScore: index % 101, difficultyScore: (index % 100) + 1 },
    entryKind: "problem_sheet",
    updatedAt: new Date(2026, 0, (index % 28) + 1).toISOString(),
    isImportant: index % 9 === 0,
    source: { type: "unknown", sourceLabel: "벤치마크" },
    questionImages: [],
    sourcePageImages: [],
    hasAnswer: false,
    hasExplanation: false,
    hasImages: false,
    isWrong: false,
    isMastered: false,
    reviewDue: false,
  } as QuestionBankItem));
}

export function benchmarkQuestionBank(size: number): QuestionBankBenchmarkResult {
  const items = createQuestionBankBenchmarkItems(size);
  const startedAt = performance.now();
  const filtered = filterQuestionBankItems(items, { search: "미분", importantOnly: false, difficultOnly: false, reviewOnly: false });
  groupQuestionBankItems(filtered, "unit");
  return { size, durationMs: performance.now() - startedAt, matched: filtered.length };
}
