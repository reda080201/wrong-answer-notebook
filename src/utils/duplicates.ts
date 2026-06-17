import type { EntryFormData, WrongAnswerEntry } from "../types";
import { parseQuestionText } from "./textLayout";

export function normalizeForDuplicate(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function similarity(a: string, b: string): number {
  const left = normalizeForDuplicate(a);
  const right = normalizeForDuplicate(b);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;

  const bigrams = (value: string) => {
    const set = new Set<string>();
    for (let i = 0; i < value.length - 1; i += 1) {
      set.add(value.slice(i, i + 2));
    }
    return set.size > 0 ? set : new Set([value]);
  };

  const aSet = bigrams(left);
  const bSet = bigrams(right);
  let overlap = 0;
  for (const item of aSet) {
    if (bSet.has(item)) overlap += 1;
  }
  return (2 * overlap) / (aSet.size + bSet.size);
}

export function findDuplicateEntry(
  entries: WrongAnswerEntry[],
  data: EntryFormData,
  ignoreId?: string,
): WrongAnswerEntry | null {
  return findDuplicateEntries(entries, data, ignoreId, 1)[0]?.entry ?? null;
}

export function duplicateScore(entry: WrongAnswerEntry, data: EntryFormData): number {
  const target = `${data.title}\n${data.question}`;
  const contentScore = similarity(target, `${entry.title}\n${entry.question}`);
  const questionCountScore = countScore(
    parseQuestionText(entry.question).filter((block) => block.kind === "question").length,
    parseQuestionText(data.question).filter((block) => block.kind === "question").length,
  );
  const answerScore = listSimilarity(
    (entry.answerKey ?? []).map((item) => item.questionNumber),
    (data.answerKey ?? []).map((item) => item.questionNumber),
  );
  const tagScore = listSimilarity(entry.tags, data.tags);

  return contentScore * 0.68 + questionCountScore * 0.12 + answerScore * 0.14 + tagScore * 0.06;
}

export function findDuplicateEntries(
  entries: WrongAnswerEntry[],
  data: EntryFormData,
  ignoreId?: string,
  limit = 3,
): Array<{ entry: WrongAnswerEntry; score: number }> {
  const candidates: Array<{ entry: WrongAnswerEntry; score: number }> = [];
  for (const entry of entries) {
    if (entry.id === ignoreId) continue;
    if (entry.entryKind !== data.entryKind) continue;
    const score = duplicateScore(entry, data);
    if (score >= 0.82) candidates.push({ entry, score });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

function countScore(a: number, b: number): number {
  if (a === 0 && b === 0) return 1;
  if (a === b) return 1;
  return Math.max(0, 1 - Math.abs(a - b) / Math.max(a, b));
}

function listSimilarity(a: string[], b: string[]): number {
  const left = new Set(a.map(normalizeForDuplicate).filter(Boolean));
  const right = new Set(b.map(normalizeForDuplicate).filter(Boolean));
  if (left.size === 0 && right.size === 0) return 1;
  let overlap = 0;
  for (const value of left) {
    if (right.has(value)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}
