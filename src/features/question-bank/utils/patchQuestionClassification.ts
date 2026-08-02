import type { QuestionMeta } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export function patchQuestionClassification(
  metas: QuestionMeta[] | undefined,
  questionNumber: string,
  classification: NonNullable<QuestionMeta["classification"]>,
  updatedAt = new Date().toISOString(),
): QuestionMeta[] {
  const normalized = normalizeQuestionNumber(questionNumber);
  const source = metas ?? [];
  let matched = false;
  return source.flatMap((meta) => {
    if (normalizeQuestionNumber(meta.questionNumber) !== normalized) return [meta];
    if (matched) return [];
    matched = true;
    return [{ ...meta, classification, updatedAt }];
  }).concat(matched ? [] : [{ questionNumber: normalized, important: false, needsReview: false, classification, updatedAt }]);
}
