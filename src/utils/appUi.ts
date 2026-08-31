import type { Difficulty, EntryKind, ListFilter, SortKey, WrongAnswerEntry } from "../types";
import { collectExplanationSearchText, getEntryTitle } from "./entry";
import {
  getImportantQuestionCount,
  getQuestionCount,
  getReviewNeedCount,
} from "./questionMeta";
import { normalizeQuestionNumber } from "./questionMeta";
import { difficultyScoreBand, resolveEntryDifficultyScore, type DifficultyScoreBand } from "./difficulty";
import { rankSearchCandidate } from "./searchEngine";

export type DifficultyFilter = "all" | Difficulty;
export type DifficultyScoreFilter = "all" | Exclude<DifficultyScoreBand, "none">;

const BASE_SORT_KEYS: SortKey[] = ["date-desc", "date-asc", "title-asc", "title-desc"];
const PROBLEM_SHEET_SORT_KEYS: SortKey[] = [
  ...BASE_SORT_KEYS,
  "question-count-desc",
  "bookmark-count-desc",
  "review-need-count-desc",
  "difficulty-score-desc",
  "difficulty-score-asc",
  "group-title-asc",
  "part-order-asc",
];
const WRONG_ANSWER_SORT_KEYS: SortKey[] = [
  ...BASE_SORT_KEYS,
  "difficulty-score-desc",
  "difficulty-score-asc",
];

export function getSortOptionsForSection(section: EntryKind): Array<{ value: SortKey; label: string }> {
  const labels: Record<SortKey, string> = {
    "date-desc": "최신순",
    "date-asc": "오래된순",
    "title-asc": "제목 가나다순",
    "title-desc": "제목 역순",
    "question-count-desc": "문항 수 많은 순",
    "bookmark-count-desc": "중요 문제 많은 순",
    "review-need-count-desc": "복습 필요 많은 순",
    "difficulty-score-desc": "난이도 높은 순",
    "difficulty-score-asc": "난이도 낮은 순",
    "group-title-asc": "묶음 이름순",
    "part-order-asc": "파트 순서순",
  };
  const keys =
    section === "problem_sheet"
      ? PROBLEM_SHEET_SORT_KEYS
      : section === "wrong_answer"
        ? WRONG_ANSWER_SORT_KEYS
        : BASE_SORT_KEYS;
  return keys.map((value) => ({ value, label: labels[value] }));
}

export function isSortKeyAllowedForSection(section: EntryKind, sortKey: SortKey): boolean {
  return getSortOptionsForSection(section).some((option) => option.value === sortKey);
}

export function isDifficultyFilterVisibleForSection(section: EntryKind): boolean {
  return section === "wrong_answer";
}

export function isDifficultyScoreFilterVisibleForSection(section: EntryKind): boolean {
  return section === "wrong_answer" || section === "problem_sheet";
}

export function getListFilterOptionsForSection(section: EntryKind): Array<{ value: ListFilter; label: string }> {
  if (section === "lecture") return [{ value: "all", label: "전체" }];
  if (section === "concept") {
    return [
      { value: "all", label: "전체" },
      { value: "mastered", label: "완료" },
      { value: "pending", label: "미완료" },
    ];
  }
  if (section === "problem_sheet") {
    return [
      { value: "all", label: "전체" },
      { value: "pending", label: "복습 필요" },
      { value: "difficult", label: "중요 문제 있음" },
      { value: "mastered", label: "완료" },
      { value: "due", label: "오늘" },
    ];
  }
  return [
    { value: "all", label: "전체" },
    { value: "pending", label: "복습 필요" },
    { value: "mastered", label: "완료" },
    { value: "difficult", label: "어려움" },
    { value: "due", label: "오늘" },
  ];
}

export function isListFilterAllowedForSection(section: EntryKind, filter: ListFilter): boolean {
  return getListFilterOptionsForSection(section).some((option) => option.value === filter);
}

export function sortEntries(list: WrongAnswerEntry[], sortKey: SortKey) {
  const copy = [...list];
  switch (sortKey) {
    case "difficulty-score-desc":
      return copy.sort(
        (a, b) =>
          resolveEntryDifficultyScore(b) - resolveEntryDifficultyScore(a) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    case "difficulty-score-asc":
      return copy.sort(
        (a, b) =>
          resolveEntryDifficultyScore(a) - resolveEntryDifficultyScore(b) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
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

export function isDifficultyScoreFilter(value: string): value is DifficultyScoreFilter {
  return (
    value === "all" ||
    value === "easy" ||
    value === "normal" ||
    value === "hard" ||
    value === "very-hard"
  );
}

export function entryMatchesDifficultyScoreFilter(
  entry: WrongAnswerEntry,
  filter: DifficultyScoreFilter,
): boolean {
  if (filter === "all") return true;
  return difficultyScoreBand(resolveEntryDifficultyScore(entry)) === filter;
}

export function imageCount(entry: WrongAnswerEntry) {
  return (
    entry.questionImages.length +
    entry.explanationParts.reduce((count, part) => count + part.images.length, 0)
  );
}

export function entryMatchesSearch(entry: WrongAnswerEntry, query: string) {
  if (!query.trim()) return true;
  return rankSearchCandidate({
    title: entry.title,
    subject: entry.subject,
    body: [entry.question, entry.myAnswer, entry.correctAnswer, ...(entry.learningBlocks ?? []).map((block) => `${block.title} ${block.content}`)].join(" "),
    explanation: collectExplanationSearchText(entry),
    metadata: [...(entry.concepts ?? []), entry.memo, ...entry.tags, ...(entry.answerKey ?? []).flatMap((item) => [item.questionNumber, item.answer, item.explanation, ...item.importantPoints])],
  }, query).matched;
}
