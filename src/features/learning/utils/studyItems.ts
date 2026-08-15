import type { LearningBlock, WrongAnswerEntry } from "../../../types";
import { getEntryQuestions } from "../../../utils/entryQuestions";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import type { StudyItemKind, StudyItemReference } from "../../../models/studySession";

export interface ResolvedStudyItem {
  id: string;
  kind: StudyItemKind;
  entry: WrongAnswerEntry;
  block?: LearningBlock;
  questionNumber?: string;
  title: string;
  prompt: string;
  answer?: string;
}

export function buildStudyItemReferences(entries: WrongAnswerEntry[], options: { includeNeedsReview?: boolean } = {}): StudyItemReference[] {
  return entries.flatMap((entry) => (entry.learningBlocks ?? []).filter((block) => options.includeNeedsReview || block.reviewStatus === "reviewed").map((block) => ({
    id: `block:${entry.id}:${block.id}`,
    kind: "learning_block" as const,
    entryId: entry.id,
    blockId: block.id,
    subjectDomain: block.subjectDomain,
  })));
}

export function resolveStudyItem(reference: StudyItemReference, entries: WrongAnswerEntry[]): ResolvedStudyItem | null {
  const entry = entries.find((candidate) => candidate.id === reference.entryId);
  if (!entry) return null;
  if (reference.kind === "learning_block") {
    const block = entry.learningBlocks?.find((candidate) => candidate.id === reference.blockId && candidate.reviewStatus === "reviewed");
    if (!block) return null;
    return { id: reference.id, kind: reference.kind, entry, block, title: block.title, prompt: block.content };
  }
  const number = normalizeQuestionNumber(reference.questionNumber ?? "");
  const question = getEntryQuestions(entry).find((candidate) => normalizeQuestionNumber(candidate.questionNumber) === number);
  return question ? { id: reference.id, kind: reference.kind, entry, questionNumber: number, title: `${number}번`, prompt: question.questionText, answer: entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === number)?.answer } : null;
}

export function scheduleManualStudyReview(order: string[], itemId: string, result: "again" | "hard" | "known"): string[] {
  const remaining = order.filter((id) => id !== itemId);
  if (result === "again") return [itemId, ...remaining];
  if (result === "hard") {
    const insertAt = Math.min(3, remaining.length);
    return [...remaining.slice(0, insertAt), itemId, ...remaining.slice(insertAt)];
  }
  return remaining;
}
