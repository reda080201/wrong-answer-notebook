import type { QuestionMeta } from "../../../types";
/** Applies only fields explicitly selected by the user; all curation and learning history survive. */
export function applyAssessmentScores(current: QuestionMeta, selected: { difficulty: boolean; importance: boolean }, now = new Date().toISOString()): QuestionMeta {
  const a = current.studyAssessment;
  if (!a) return current;
  const source = current.assessmentEvidence ? "gpt" as const : "imported" as const;
  return { ...current, updatedAt: now,
    ...(selected.difficulty ? { difficultyScore: a.scores.difficulty.value ?? undefined, classification: { ...current.classification, difficultySource: source } } : {}),
    ...(selected.importance ? { rating: { ...current.rating, importanceScore: a.scores.importance.value ?? undefined, evaluationSource: source, lastEvaluatedAt: now } } : {}),
  };
}
