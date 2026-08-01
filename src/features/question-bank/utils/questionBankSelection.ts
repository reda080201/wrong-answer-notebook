import type { QuestionBankSort, QuestionBankStoredFilters } from "../../../types";
import { DEFAULT_QUESTION_BANK_FILTERS, type QuestionBankFilters, type QuestionBankItem } from "../model/questionBankTypes";

export function filtersFromPreferences(filters?: QuestionBankStoredFilters): QuestionBankFilters {
  return { ...DEFAULT_QUESTION_BANK_FILTERS, ...filters, search: "" };
}

export function filtersForPreferences(filters: QuestionBankFilters): QuestionBankStoredFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([key]) => key !== "search"),
  ) as QuestionBankStoredFilters;
}

export function sortQuestionBankItems(items: QuestionBankItem[], sort: QuestionBankSort): QuestionBankItem[] {
  const score = (item: QuestionBankItem) => sort === "difficulty"
    ? item.classification.difficultyScore ?? -1
    : sort === "importance"
      ? item.classification.importanceScore ?? -1
      : sort === "quality"
        ? item.classification.qualityScore ?? -1
        : sort === "review_due"
          ? item.reviewDue ? 1 : 0
          : Date.parse(item.updatedAt) || 0;
  return [...items].sort((left, right) => score(right) - score(left) || left.id.localeCompare(right.id));
}

function seededRandom(seed: string): () => number {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return () => {
    value += value << 13; value ^= value >>> 7; value += value << 3; value ^= value >>> 17; value += value << 5;
    return (value >>> 0) / 4294967296;
  };
}

export function selectQuestionBankItems(items: QuestionBankItem[], count: number, seed: string): QuestionBankItem[] {
  const random = seededRandom(seed);
  const pool = [...items];
  const selected: QuestionBankItem[] = [];
  while (pool.length && selected.length < Math.max(0, count)) {
    selected.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return selected;
}
