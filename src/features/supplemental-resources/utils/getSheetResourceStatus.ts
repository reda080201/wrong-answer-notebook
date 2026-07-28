import type { SheetAnswerItem, WrongAnswerEntry } from "../../../types";
import { getQuestionNumbers } from "../../../utils/importValidation";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export type SheetResourceCompleteness = "none" | "partial" | "complete";

export interface SheetResourceStatus {
  questionCount: number;
  answerCount: number;
  explanationCount: number;
  supplementalCount: number;
  answerState: SheetResourceCompleteness;
  explanationState: SheetResourceCompleteness;
}

function questionNumbers(entry: WrongAnswerEntry): Set<string> {
  const numbers = [
    ...getQuestionNumbers(entry.question),
    ...(entry.questionMeta ?? []).map((item) => normalizeQuestionNumber(item.questionNumber)),
    ...(entry.answerKey ?? []).map((item) => normalizeQuestionNumber(item.questionNumber)),
  ].filter(Boolean);
  return new Set(numbers);
}

function hasExplanation(item: SheetAnswerItem): boolean {
  return Boolean(
    item.explanation.trim() ||
    item.strategy?.trim() ||
    item.steps?.length ||
    item.choiceJudgements?.length ||
    item.wrongPoint?.trim() ||
    item.reviewPoint?.trim(),
  );
}

function completeness(count: number, total: number): SheetResourceCompleteness {
  if (!count) return "none";
  return count >= total && total > 0 ? "complete" : "partial";
}

export function getSheetResourceStatus(entry: WrongAnswerEntry): SheetResourceStatus {
  const numbers = questionNumbers(entry);
  const relevant = (entry.answerKey ?? []).filter((item) => numbers.has(normalizeQuestionNumber(item.questionNumber)));
  const answerCount = new Set(relevant.filter((item) => item.answer.trim()).map((item) => normalizeQuestionNumber(item.questionNumber))).size;
  const explanationCount = new Set(relevant.filter(hasExplanation).map((item) => normalizeQuestionNumber(item.questionNumber))).size;
  return {
    questionCount: numbers.size,
    answerCount,
    explanationCount,
    supplementalCount: entry.supplementalResources?.length ?? 0,
    answerState: completeness(answerCount, numbers.size),
    explanationState: completeness(explanationCount, numbers.size),
  };
}
