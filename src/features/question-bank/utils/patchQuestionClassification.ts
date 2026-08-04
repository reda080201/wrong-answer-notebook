import type { QuestionClassification, QuestionMeta } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export interface QuestionMetaPatch {
  classification: QuestionClassification;
  difficultyScore?: number;
  importanceScore?: number;
  qualityScore?: number;
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
      difficultyScore: patch.difficultyScore ?? meta.difficultyScore,
      rating: {
        ...meta.rating,
        importanceScore: patch.importanceScore ?? meta.rating?.importanceScore,
        qualityScore: patch.qualityScore ?? meta.rating?.qualityScore,
      },
      classification: patch.classification,
      updatedAt,
    }];
  }).concat(matched ? [] : [{
    questionNumber: normalized,
    important: false,
    needsReview: false,
    difficultyScore: patch.difficultyScore,
    rating: {
      importanceScore: patch.importanceScore,
      qualityScore: patch.qualityScore,
    },
    classification: patch.classification,
    updatedAt,
  }]);
}
