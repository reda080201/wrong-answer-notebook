import type { ExportScopeMode } from "../../../types";
import type { AnswerProtectionContext } from "../types";

export function canIncludeAnswers(context: AnswerProtectionContext): boolean {
  return Boolean(context.submitted && context.allowAnswers);
}

export function sanitizeProtectedFields<T extends Record<string, unknown>>(
  payload: T,
  context: AnswerProtectionContext,
): T {
  if (canIncludeAnswers(context)) return payload;
  const next = { ...payload } as Record<string, unknown>;
  delete next.correctAnswer;
  delete next.answer;
  delete next.answerKey;
  delete next.explanation;
  delete next.explanationParts;
  delete next.solution;
  delete next.wrongPoint;
  delete next.reviewPoint;
  delete next.mistakeAnalysis;
  delete next.score;
  return next as T;
}

export function describeAnswerProtection(context: AnswerProtectionContext): string {
  return canIncludeAnswers(context)
    ? "released"
    : "active";
}

export function isAnswerProtectedScope(_scope: ExportScopeMode, submitted: boolean): boolean {
  return !submitted;
}
