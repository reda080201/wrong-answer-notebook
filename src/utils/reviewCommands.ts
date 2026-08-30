import type { ReviewResult } from "../types";

export interface ReviewCommand {
  key: string;
  label: string;
  description: string;
  result?: ReviewResult;
}

/** The help overlay and keyboard handler deliberately share this registry. */
export const reviewCommands: readonly ReviewCommand[] = [
  { key: "Space", label: "Space", description: "정답 보기" },
  { key: "1", label: "1", description: "다시", result: "again" },
  { key: "2", label: "2", description: "어려움", result: "hard" },
  { key: "3", label: "3", description: "맞음", result: "good" },
  { key: "ArrowLeft", label: "Left", description: "이전 문항" },
  { key: "ArrowRight", label: "Right", description: "다음 문항" },
];

export function isEditableCommandTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable='true'], [data-command-editing='true']"));
}
