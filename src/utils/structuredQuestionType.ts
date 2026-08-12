import type { StructuredQuestionType } from "../types";

const MULTIPLE_CHOICE_ALIASES = new Set([
  "multiple_choice",
  "multiple-choice",
  "multiple choice",
  "choice",
  "객관식",
]);
const SHORT_ANSWER_ALIASES = new Set([
  "short_answer",
  "short-answer",
  "short answer",
  "주관식",
  "단답형",
]);
const ESSAY_ALIASES = new Set(["essay", "서술형", "논술형"]);

export function normalizeStructuredQuestionType(value: unknown): StructuredQuestionType | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (MULTIPLE_CHOICE_ALIASES.has(normalized)) return "multiple_choice";
  if (SHORT_ANSWER_ALIASES.has(normalized)) return "short_answer";
  if (ESSAY_ALIASES.has(normalized)) return "essay";
  return "unknown";
}

export function isMultipleChoiceQuestion(
  questionType: unknown,
  choices: string[] = [],
): boolean {
  const normalized = normalizeStructuredQuestionType(questionType);
  if (normalized === "multiple_choice") return true;
  if (normalized === "short_answer" || normalized === "essay") return false;
  return choices.length > 0;
}
