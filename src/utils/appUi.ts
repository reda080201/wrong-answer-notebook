import type { Difficulty, EntryKind, SortKey, WrongAnswerEntry } from "../types";
import { collectExplanationSearchText, getEntryTitle } from "./entry";
import {
  getImportantQuestionCount,
  getQuestionCount,
  getReviewNeedCount,
} from "./questionMeta";
import { normalizeQuestionNumber } from "./questionMeta";

export type DifficultyFilter = "all" | Difficulty;

export function sortEntries(list: WrongAnswerEntry[], sortKey: SortKey) {
  const copy = [...list];
  switch (sortKey) {
    case "question-count-desc":
      return copy.sort((a, b) => getQuestionCount(b) - getQuestionCount(a));
    case "bookmark-count-desc":
      return copy.sort(
        (a, b) => getImportantQuestionCount(b) - getImportantQuestionCount(a),
      );
    case "review-need-count-desc":
      return copy.sort((a, b) => getReviewNeedCount(b) - getReviewNeedCount(a));
    case "group-title-asc":
      return copy.sort((a, b) =>
        `${a.sheetGroup?.groupTitle ?? getEntryTitle(a)}`.localeCompare(
          `${b.sheetGroup?.groupTitle ?? getEntryTitle(b)}`,
          "ko",
        ),
      );
    case "part-order-asc":
      return copy.sort(
        (a, b) =>
          (a.sheetGroup?.partOrder ?? Number.MAX_SAFE_INTEGER) -
            (b.sheetGroup?.partOrder ?? Number.MAX_SAFE_INTEGER) ||
          normalizeQuestionNumber(a.sheetGroup?.questionRange).localeCompare(
            normalizeQuestionNumber(b.sheetGroup?.questionRange),
            "ko",
          ) ||
          getEntryTitle(a).localeCompare(getEntryTitle(b), "ko"),
      );
    case "title-asc":
      return copy.sort((a, b) =>
        getEntryTitle(a).localeCompare(getEntryTitle(b), "ko"),
      );
    case "title-desc":
      return copy.sort((a, b) =>
        getEntryTitle(b).localeCompare(getEntryTitle(a), "ko"),
      );
    case "date-asc":
      return copy.sort(
        (a, b) =>
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      );
    case "date-desc":
    default:
      return copy.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }
}

export function getEntryCardPreview(entry: WrongAnswerEntry): string {
  const text =
    entry.entryKind === "concept"
      ? entry.question.trim() || entry.memo.trim()
      : entry.entryKind === "lecture"
        ? (entry.learningBlocks ?? [])
            .map((block) => `${block.title} ${block.content}`)
            .join("\n")
            .trim()
        : "";
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 90) ?? ""
  );
}

export function entryKindName(kind: EntryKind): string {
  if (kind === "concept") return "개념";
  if (kind === "problem_sheet") return "시험지";
  if (kind === "lecture") return "특강자료";
  return "오답";
}

export function entryKindIcon(kind: EntryKind): string {
  if (kind === "concept") return "💡";
  if (kind === "problem_sheet") return "📄";
  if (kind === "lecture") return "🎓";
  return "📓";
}

export function isDifficultyFilter(value: string): value is DifficultyFilter {
  return (
    value === "all" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "none"
  );
}

export function imageCount(entry: WrongAnswerEntry) {
  return (
    entry.questionImages.length +
    entry.explanationParts.reduce((count, part) => count + part.images.length, 0)
  );
}

export function entryMatchesSearch(entry: WrongAnswerEntry, query: string) {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const haystack = [
    entry.title,
    entry.question,
    entry.myAnswer,
    entry.correctAnswer,
    collectExplanationSearchText(entry),
    ...(entry.answerKey ?? []).flatMap((item) => [
      item.questionNumber,
      item.answer,
      item.explanation,
      ...item.importantPoints,
    ]),
    ...(entry.learningBlocks ?? []).flatMap((block) => [
      block.title,
      block.content,
    ]),
    ...(entry.concepts ?? []),
    entry.memo,
    entry.subject,
    ...entry.tags,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
