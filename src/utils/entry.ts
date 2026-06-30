import { v4 as uuidv4 } from "uuid";
import type {
  ChecklistItem,
  Difficulty,
  EntryKind,
  ExplanationPart,
  MistakeCauseType,
  ReviewEvent,
  ReviewResult,
  ReviewState,
  SheetFigureItem,
  SheetAnswerItem,
  WrongAnswerEntry,
} from "../types";
import { isReviewStrategy, normalizeMistakeAnalysis } from "./mistakeAnalysis";
import { normalizeImportAudit, normalizeRejectedNotes } from "./importAudit";

function isEntryKind(v: unknown): v is EntryKind {
  return v === "wrong_answer" || v === "problem_sheet" || v === "concept";
}

function isDifficulty(v: unknown): v is Difficulty {
  return v === "high" || v === "medium" || v === "low" || v === "none";
}

function normalizeAnswerDifficulty(v: unknown): Exclude<Difficulty, "none"> | undefined {
  return v === "high" || v === "medium" || v === "low" ? v : undefined;
}

function isFigureSource(v: unknown): v is SheetFigureItem["source"] {
  return v === "original" || v === "gpt_cleaned";
}

function isReviewResult(v: unknown): v is ReviewResult {
  return v === "again" || v === "hard" || v === "good";
}

function isValidIsoDate(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(new Date(v).getTime());
}

function normalizeReview(raw: unknown): ReviewState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<ReviewState>;
  const historySource = Array.isArray(value.history) ? value.history : [];
  const history: ReviewEvent[] = historySource
    .filter((event) => Boolean(event && typeof event === "object"))
    .map((event) => event as Partial<ReviewEvent>)
    .map((event) => {
      const reviewedAt = isValidIsoDate(event.reviewedAt)
        ? event.reviewedAt
        : new Date().toISOString();
      const nextDueAt =
        event.nextDueAt === null || isValidIsoDate(event.nextDueAt)
          ? event.nextDueAt
          : null;
      return {
        id: event.id || uuidv4(),
        reviewedAt,
        result: isReviewResult(event.result) ? event.result : "again",
        nextDueAt,
        intervalDays:
          typeof event.intervalDays === "number" && event.intervalDays >= 0
            ? event.intervalDays
            : 1,
        causeSnapshot: Array.isArray(event.causeSnapshot)
          ? event.causeSnapshot.filter((item): item is MistakeCauseType =>
              item === "calculation" ||
              item === "condition_misread" ||
              item === "concept_gap" ||
              item === "strategy_gap" ||
              item === "time_pressure" ||
              item === "choice_trap" ||
              item === "careless" ||
              item === "unknown",
            )
          : undefined,
        strategy: isReviewStrategy(event.strategy) ? event.strategy : undefined,
      };
    });

  return {
    dueAt: value.dueAt === null || isValidIsoDate(value.dueAt) ? value.dueAt : null,
    lastReviewedAt: isValidIsoDate(value.lastReviewedAt)
      ? value.lastReviewedAt
      : undefined,
    intervalDays:
      typeof value.intervalDays === "number" && value.intervalDays >= 0
        ? value.intervalDays
        : 0,
    streak:
      typeof value.streak === "number" && value.streak >= 0
        ? Math.floor(value.streak)
        : 0,
    history,
  };
}

function normalizeChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<ChecklistItem> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      id: item.id || uuidv4(),
      text: item.text ?? "",
      checked: Boolean(item.checked),
    }))
    .filter((item) => item.text.trim());
}

function normalizeImportantPoints(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n|[,;、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeChoiceJudgements(raw: unknown): Array<{ marker: string; text: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): { marker: string; text: string } | null => {
      if (typeof item === "string") {
        const [marker = "", ...rest] = item.split(/[:：]/);
        const text = rest.join(":").trim();
        return text ? { marker: marker.trim(), text } : { marker: "", text: item.trim() };
      }
      if (!item || typeof item !== "object") return null;
      const typed = item as { marker?: unknown; text?: unknown; judgement?: unknown; judgment?: unknown };
      const text = `${typed.text ?? typed.judgement ?? typed.judgment ?? ""}`.trim();
      if (!text) return null;
      return {
        marker: `${typed.marker ?? ""}`.trim(),
        text,
      };
    })
    .filter((item): item is { marker: string; text: string } => Boolean(item));
}

export function normalizeAnswerKey(raw: unknown): SheetAnswerItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => Boolean(item && typeof item === "object"))
    .map((item) => item as Partial<SheetAnswerItem>)
    .map((item) => ({
      id: item.id || uuidv4(),
      questionNumber: `${item.questionNumber ?? ""}`.trim(),
      answer: `${item.answer ?? ""}`.trim(),
      explanation: `${item.explanation ?? ""}`.trim(),
      strategy: `${item.strategy ?? ""}`.trim(),
      steps: normalizeImportantPoints(item.steps),
      choiceJudgements: normalizeChoiceJudgements(item.choiceJudgements),
      wrongPoint: `${item.wrongPoint ?? ""}`.trim(),
      reviewPoint: `${item.reviewPoint ?? ""}`.trim(),
      notes: `${item.notes ?? ""}`.trim(),
      importantPoints: normalizeImportantPoints(item.importantPoints),
      difficulty: normalizeAnswerDifficulty(item.difficulty),
      concepts: normalizeImportantPoints(item.concepts),
      needsReview: Boolean(item.needsReview),
      sourceNote: `${item.sourceNote ?? ""}`.trim(),
    }))
    .filter(
      (item) =>
        item.questionNumber ||
        item.answer ||
        item.explanation ||
        item.strategy ||
        item.steps.length ||
        item.choiceJudgements.length ||
        item.wrongPoint ||
        item.reviewPoint ||
        item.notes ||
        item.importantPoints.length,
    );
}

export function normalizeFigures(raw: unknown): SheetFigureItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => Boolean(item && typeof item === "object"))
    .map((item) => item as Partial<SheetFigureItem>)
    .map((item) => ({
      id: item.id || uuidv4(),
      questionNumber: `${item.questionNumber ?? ""}`.trim(),
      title: `${item.title ?? ""}`.trim(),
      caption: `${item.caption ?? ""}`.trim(),
      image: item.image ? `${item.image}`.trim() : undefined,
      source: isFigureSource(item.source) ? item.source : "gpt_cleaned",
      needsReview: Boolean(item.needsReview),
    }))
    .filter((item) => item.questionNumber || item.title || item.caption || item.image);
}

export function normalizeEntry(raw: WrongAnswerEntry): WrongAnswerEntry {
  const {
    explanation: _legacyExp,
    explanationImages: _legacyExpImg,
    images: _legacyImg,
    ...rest
  } = raw;
  void _legacyExp;
  void _legacyExpImg;
  void _legacyImg;

  const legacy = _legacyImg ?? [];
  let title = rest.title?.trim() ?? "";
  let question = rest.question ?? "";

  if (!title && question.trim()) {
    const lines = question.trim().split("\n");
    title = lines[0].slice(0, 120);
    if (lines.length > 1) {
      question = lines.slice(1).join("\n").trim();
    }
  }

  let explanationParts: ExplanationPart[] = Array.isArray(rest.explanationParts)
    ? rest.explanationParts.map((p) => ({
        id: p.id || uuidv4(),
        text: p.text ?? "",
        images: [...(p.images ?? [])],
      }))
    : [];

  const legacyText = _legacyExp?.trim() ?? "";
  const legacyImgs = _legacyExpImg?.length ? [..._legacyExpImg] : [];

  if (!explanationParts.length && (legacyText || legacyImgs.length)) {
    explanationParts = [
      {
        id: "migrated-legacy",
        text: legacyText,
        images: legacyImgs,
      },
    ];
  }

  const entryKind: EntryKind = isEntryKind(rest.entryKind)
    ? rest.entryKind
    : "wrong_answer";

  // Migrate or normalize difficulty
  const rawDifficulty: unknown = rest.difficulty;
  let difficulty: Difficulty = "none";
  if (isDifficulty(rawDifficulty)) {
    difficulty = rawDifficulty;
  } else if (rest.difficult) {
    difficulty = "high";
  }

  const answerKey = normalizeAnswerKey(rest.answerKey);
  const figures = normalizeFigures(rest.figures);

  return {
    ...rest,
    title,
    question,
    entryKind,
    difficult: Boolean(rest.difficult),
    difficulty,
    questionImages: rest.questionImages?.length
      ? rest.questionImages
      : legacy,
    explanationParts,
    memo: rest.memo ?? "",
    annotations: rest.annotations ?? [],
    tags: Array.isArray(rest.tags) ? rest.tags : [],
    answerKey,
    figures,
    importAudit: rest.importAudit
      ? normalizeImportAudit(rest.importAudit, { question, answerKey, figures })
      : undefined,
    rejectedNotes: normalizeRejectedNotes(rest.rejectedNotes),
    mistakeAnalysis: normalizeMistakeAnalysis(rest.mistakeAnalysis),
    review: normalizeReview(rest.review),
    checklist: entryKind === "concept" ? normalizeChecklist(rest.checklist) : rest.checklist ?? [],
  };
}

export function getEntryTitle(entry: WrongAnswerEntry): string {
  const t = entry.title.trim();
  if (t) return t;
  if (entry.questionImages.length > 0) return "(이미지 문제)";
  if (entry.question.trim()) return entry.question.trim().slice(0, 40);
  return "(제목 없음)";
}

export function getAllImageFilenames(entry: WrongAnswerEntry): string[] {
  const fromParts = entry.explanationParts.flatMap((p) => p.images);
  const fromFigures = (entry.figures ?? []).flatMap((figure) => (figure.image ? [figure.image] : []));
  return [
    ...new Set([
      ...entry.questionImages,
      ...fromParts,
      ...fromFigures,
      ...(entry.images ?? []),
    ]),
  ];
}

export function hasEntryContent(
  entry: Pick<WrongAnswerEntry, "title" | "question" | "questionImages">,
): boolean {
  return (
    Boolean(entry.title.trim()) ||
    Boolean(entry.question.trim()) ||
    entry.questionImages.length > 0
  );
}

export function explanationPartHasContent(part: ExplanationPart): boolean {
  return Boolean(part.text.trim()) || part.images.length > 0;
}

export function hasExplanationContent(entry: WrongAnswerEntry): boolean {
  return entry.explanationParts.some(explanationPartHasContent);
}

export function collectExplanationSearchText(entry: WrongAnswerEntry): string {
  return entry.explanationParts.map((p) => p.text).join(" ");
}
