import type { StructuredQuestion } from "../types";
import { parseQuestionText, type QuestionBlock } from "./textLayout";
import { normalizeQuestionNumber } from "./questionNumber";
import { renderStructuredQuestionsCompatibilityText } from "./entryQuestions";
import { questionCompatibilityEnd } from "./questionStimuli";

export const COMPATIBILITY_REVIEW_WARNING = "원문과 수정 문항의 연결이 모호해 기존 원문을 보존했습니다. 연결을 검토해 주세요.";
export interface CompatibilityEdit { before?: StructuredQuestion; after?: StructuredQuestion; passage?: string; }

/** Patch only uniquely located edits. Keep shared passages and legacy-only prose verbatim. */
export function applyQuestionCompatibilityEdits(original: string, edits: CompatibilityEdit[]) {
  if (!original.trim()) return { text: renderStructuredQuestionsCompatibilityText(edits.flatMap(edit => edit.after ? [edit.after] : [])), unresolved: [] as string[] };
  const blocks = parseQuestionText(original).filter((block): block is QuestionBlock => block.kind === "question");
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const additions: string[] = [];
  const unresolved: string[] = [];
  for (const { before, after, passage } of edits) {
    const source = before ?? after;
    if (!source) continue;
    const number = normalizeQuestionNumber(source.questionNumber);
    const matches = blocks.filter(block => normalizeQuestionNumber(block.numberLabel || String(block.displayNumber)) === number);
    if (!before && matches.length === 1) continue;
    if (matches.length === 0 && after && (!before || blocks.length > 0)) { additions.push([passage && !original.includes(passage) ? passage : "", renderStructuredQuestionsCompatibilityText([after])].filter(Boolean).join("\n\n")); continue; }
    if (matches.length !== 1) {
      if (JSON.stringify(before) !== JSON.stringify(after)) unresolved.push(after?.questionNumber ?? source.questionNumber);
      continue;
    }
    const block = matches[0];
    const end = questionCompatibilityEnd(original, block);
    if (!after) { replacements.push({ start: block.start, end, text: "" }); continue; }
    if (!before || JSON.stringify(before) === JSON.stringify(after)) continue;
    let fragment = original.slice(block.start, end);
    const changes = new Map<string, string>();
    let ambiguous = false;
    const change = (oldValue: string | undefined, newValue: string | undefined) => {
      if (oldValue === newValue || !oldValue?.trim()) return;
      const next = newValue ?? "";
      if (changes.has(oldValue) && changes.get(oldValue) !== next) ambiguous = true;
      changes.set(oldValue, next);
    };
    const oldSegments = before.contentSegments ?? [];
    const newSegments = after.contentSegments ?? [];
    let changedTextSegment = false;
    for (const segment of oldSegments) {
      const candidates = newSegments.filter(item => item.id === segment.id);
      if (candidates.length > 1) { ambiguous = true; continue; }
      const next = candidates[0];
      if (segment.type === "text" || segment.type === "condition") {
        const value = next?.type === segment.type ? next.text : undefined;
        if (segment.text !== value) changedTextSegment = changedTextSegment || segment.type === "text";
        change(segment.text, value);
      } else if (segment.type === "equation") change(segment.latex, next?.type === "equation" ? next.latex : undefined);
    }
    if (!changedTextSegment) change(before.questionText, after.questionText);
    for (const field of ["choices", "conditions", "equations"] as const) {
      before[field].forEach((value, index) => change(value, after[field][index]));
    }
    // Plan edits against the original fragment, so repeated equations cannot
    // be accidentally replaced again by an earlier replacement's output.
    const local: Array<{ start: number; end: number; text: string }> = [];
    for (const [oldValue, newValue] of changes) {
      const start = fragment.indexOf(oldValue);
      if (start < 0) continue; // A canonical-only field has no legacy range to rewrite.
      if (fragment.indexOf(oldValue, start + oldValue.length) >= 0) { ambiguous = true; continue; }
      local.push({ start, end: start + oldValue.length, text: newValue });
    }
    local.sort((a, b) => a.start - b.start);
    if (local.some((item, index) => index > 0 && item.start < local[index - 1].end)) ambiguous = true;
    if (ambiguous) { unresolved.push(after.questionNumber); continue; }
    for (const item of local.reverse()) fragment = fragment.slice(0, item.start) + item.text + fragment.slice(item.end);
    if (before.questionNumber !== after.questionNumber) {
      const header = fragment.slice(0, block.bodyStart - block.start);
      const updatedHeader = header.replace(/(\d{1,3})(?=\s*(?:[.)]|\]|번))/, after.questionNumber);
      if (header === updatedHeader) { unresolved.push(after.questionNumber); continue; }
      fragment = updatedHeader + fragment.slice(header.length);
    }
    replacements.push({ start: block.start, end, text: fragment });
  }
  let text = original;
  for (const item of replacements.sort((a, b) => b.start - a.start)) text = text.slice(0, item.start) + item.text + text.slice(item.end);
  if (additions.length) text = [text.trimEnd(), ...additions].join("\n\n");
  return { text, unresolved: [...new Set(unresolved)] };
}

export function updateQuestionCompatibilityText(original: string, next: StructuredQuestion[], previous = next) {
  const edits: CompatibilityEdit[] = previous.map((before, index) => ({ before, after: next[index] }));
  return applyQuestionCompatibilityEdits(original, [...edits, ...next.slice(previous.length).map(after => ({ after }))]);
}
