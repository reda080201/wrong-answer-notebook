import type {
  ProblemSourceType,
  QuestionAnswerType,
  QuestionClassification,
  QuestionMeta,
  WrongAnswerEntry,
} from "../types";
import { normalizeDifficultyScore } from "./difficulty";
import { normalizeProblemSourceType, resolveProblemSource } from "./problemSource";

const ANSWER_TYPES = new Set<QuestionAnswerType>([
  "multiple_choice", "short_answer", "essay", "unknown",
]);
const DIFFICULTY_SOURCES = new Set(["manual", "imported", "heuristic", "gemini"]);

function normalizedText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizedList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = [...new Set(value.map(normalizedText).filter((item): item is string => Boolean(item)))];
  return values.length ? values : undefined;
}

export function normalizeQuestionClassification(raw: unknown): QuestionClassification | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const points = normalizeDifficultyScore(value.points);
  const classification: QuestionClassification = {
    subject: normalizedText(value.subject),
    curriculum: normalizedText(value.curriculum),
    unit: normalizedText(value.unit),
    subunit: normalizedText(value.subunit),
    concepts: normalizedList(value.concepts),
    sourceType: typeof value.sourceType === "string" ? normalizeProblemSourceType(value.sourceType) : undefined,
    difficultySource: typeof value.difficultySource === "string" && DIFFICULTY_SOURCES.has(value.difficultySource)
      ? value.difficultySource as QuestionClassification["difficultySource"]
      : undefined,
    answerType: typeof value.answerType === "string" && ANSWER_TYPES.has(value.answerType as QuestionAnswerType)
      ? value.answerType as QuestionAnswerType
      : undefined,
    points,
    tags: normalizedList(value.tags),
  };
  return Object.values(classification).some((item) => item !== undefined) ? classification : undefined;
}

export interface ResolvedQuestionClassification extends QuestionClassification {
  subject: string;
  sourceType: ProblemSourceType;
  difficultyScore?: number;
  importanceScore?: number;
  qualityScore?: number;
  isPastExam: boolean;
}

export function resolveQuestionClassification(
  entry: WrongAnswerEntry,
  meta?: QuestionMeta,
): ResolvedQuestionClassification {
  const classification = meta?.classification ?? {};
  const sourceType = classification.sourceType ?? resolveProblemSource(entry.problemSource).type;
  return {
    ...classification,
    subject: classification.subject || entry.subject || "기타",
    sourceType,
    difficultyScore: normalizeDifficultyScore(meta?.difficultyScore),
    importanceScore: normalizeDifficultyScore(meta?.rating?.importanceScore),
    qualityScore: normalizeDifficultyScore(meta?.rating?.qualityScore),
    isPastExam: sourceType === "past_exam",
  };
}

export function resolveQuestionDifficulty(meta?: QuestionMeta): number | undefined {
  return normalizeDifficultyScore(meta?.difficultyScore);
}

export function resolveQuestionImportance(meta?: QuestionMeta): number | undefined {
  return normalizeDifficultyScore(meta?.rating?.importanceScore);
}

export function resolveQuestionQuality(meta?: QuestionMeta): number | undefined {
  return normalizeDifficultyScore(meta?.rating?.qualityScore);
}
