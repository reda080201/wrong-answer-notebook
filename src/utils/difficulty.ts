import type { Difficulty, QuestionMeta, SheetAnswerItem, WrongAnswerEntry } from "../types";
import type { QuestionBlock } from "./textLayout";
import { normalizeQuestionNumber } from "./questionNumber";

export type DifficultyScoreBand = "easy" | "normal" | "hard" | "very-hard" | "none";

export function normalizeDifficultyScore(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(1, Math.min(100, Math.round(numeric)));
}

export function estimateDifficultyScore(
  difficulty: Difficulty | undefined,
  difficult: boolean,
): number {
  if (difficult) return 85;
  if (difficulty === "high") return 80;
  if (difficulty === "medium") return 55;
  if (difficulty === "low") return 25;
  return 0;
}

export function difficultyScoreBand(score?: number): DifficultyScoreBand {
  const normalized = normalizeDifficultyScore(score);
  if (!normalized) return "none";
  if (normalized <= 30) return "easy";
  if (normalized <= 60) return "normal";
  if (normalized <= 85) return "hard";
  return "very-hard";
}

export function difficultyScoreLabel(score?: number): string {
  const normalized = normalizeDifficultyScore(score);
  if (!normalized) return "난이도 미지정";
  const band = difficultyScoreBand(normalized);
  const label =
    band === "easy"
      ? "쉬움"
      : band === "normal"
        ? "보통"
        : band === "hard"
          ? "어려움"
          : "매우 어려움";
  return `${label} · ${normalized}/100`;
}

export function resolveEntryDifficultyScore(entry: WrongAnswerEntry): number {
  return (
    normalizeDifficultyScore(entry.difficultyScore) ??
    estimateDifficultyScore(entry.difficulty, entry.difficult)
  );
}

export function resolveAnswerDifficultyScore(answer?: SheetAnswerItem): number | undefined {
  if (!answer) return undefined;
  return (
    normalizeDifficultyScore(answer.difficultyScore) ??
    (answer.difficulty ? estimateDifficultyScore(answer.difficulty, false) : undefined)
  );
}

export function resolveQuestionDifficultyScore(
  questionMeta: QuestionMeta[] | undefined,
  answerKey: SheetAnswerItem[] | undefined,
  block: Pick<QuestionBlock, "displayNumber" | "numberLabel">,
): number | undefined {
  const candidates = new Set([
    normalizeQuestionNumber(block.displayNumber),
    normalizeQuestionNumber(block.numberLabel),
  ]);
  const meta = (questionMeta ?? []).find((item) =>
    candidates.has(normalizeQuestionNumber(item.questionNumber)),
  );
  const metaScore = normalizeDifficultyScore(meta?.difficultyScore);
  if (metaScore) return metaScore;
  const answer = (answerKey ?? []).find((item) =>
    candidates.has(normalizeQuestionNumber(item.questionNumber)),
  );
  return resolveAnswerDifficultyScore(answer);
}

export function maxAnswerDifficultyScore(answerKey: SheetAnswerItem[] | undefined): number | undefined {
  const scores = (answerKey ?? [])
    .map((item) => normalizeDifficultyScore(item.difficultyScore))
    .filter((score): score is number => Boolean(score));
  return scores.length ? Math.max(...scores) : undefined;
}
