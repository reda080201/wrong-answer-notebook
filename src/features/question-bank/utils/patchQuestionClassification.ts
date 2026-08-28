import type { QuestionClassification, QuestionMeta } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export interface QuestionMetaPatch {
  classification: QuestionClassification;
  difficultyScore?: number | null;
  importanceScore?: number | null;
  qualityScore?: number | null;
}

export function patchQuestionClassification(
  metas: QuestionMeta[] | undefined,
  questionNumber: string,
  patch: QuestionMetaPatch,
  updatedAt = new Date().toISOString(),
): QuestionMeta[] {
  const normalized = normalizeQuestionNumber(questionNumber);
  const source = metas ?? [];
  let matched = false;
  return source.flatMap((meta) => {
    if (normalizeQuestionNumber(meta.questionNumber) !== normalized) return [meta];
    if (matched) return [];
    matched = true;
    return [{
      ...meta,
      difficultyScore: patch.difficultyScore === undefined ? meta.difficultyScore : patch.difficultyScore ?? undefined,
      rating: {
        ...meta.rating,
        importanceScore: patch.importanceScore === undefined ? meta.rating?.importanceScore : patch.importanceScore ?? undefined,
        qualityScore: patch.qualityScore === undefined ? meta.rating?.qualityScore : patch.qualityScore ?? undefined,
      },
      classification: patch.classification,
      updatedAt,
    }];
  }).concat(matched ? [] : [{
    questionNumber: normalized,
    important: false,
    needsReview: false,
    difficultyScore: patch.difficultyScore ?? undefined,
    rating: {
      importanceScore: patch.importanceScore ?? undefined,
      qualityScore: patch.qualityScore ?? undefined,
    },
    classification: patch.classification,
    updatedAt,
  }]);
}
