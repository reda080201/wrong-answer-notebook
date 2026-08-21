import type { ProblemSheetDisplayMode } from "../types";

export function normalizeProblemSheetDisplayMode(value: unknown): Exclude<ProblemSheetDisplayMode, "questions"> {
  if (value === "exam") return "exam";
  if (value === "one_question") return "one_question";
  return "continuous";
}

export function shouldHandleStudyKeyboard(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  return !target.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], .math-editor");
}

export function getQuestionNavigationIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, current + delta));
}
