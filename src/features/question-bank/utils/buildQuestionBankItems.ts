import { parseQuestionText, type QuestionBlock } from "../../../utils/textLayout";
import { getEntryQuestions } from "../../../utils/entryQuestions";
import { normalizeQuestionMeta, normalizeQuestionNumber } from "../../../utils/questionMeta";
import { resolveQuestionClassification } from "../../../utils/questionClassification";
import { resolveProblemSource } from "../../../utils/problemSource";
import { resolveQuestionAssets, resolveQuestionFigures } from "../../../utils/questionAssets";
import type { ResolvedEntryQuestion } from "../../../utils/entryQuestions";
import type { QuestionMeta, SheetAnswerItem, WrongAnswerEntry } from "../../../types";
import type { QuestionBankItem } from "../model/questionBankTypes";

const unique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];

function findMeta(entry: WrongAnswerEntry, number: string): QuestionMeta | undefined {
  const key = normalizeQuestionNumber(number);
  return normalizeQuestionMeta(entry.questionMeta).find((meta) => normalizeQuestionNumber(meta.questionNumber) === key);
}

function findAnswer(entry: WrongAnswerEntry, number: string): SheetAnswerItem | undefined {
  const key = normalizeQuestionNumber(number);
  return (entry.answerKey ?? []).find((answer) => normalizeQuestionNumber(answer.questionNumber) === key);
}

function reviewDue(meta: QuestionMeta | undefined, now: Date): boolean {
  const dueAt = meta?.review?.dueAt;
  return Boolean(dueAt && new Date(dueAt).getTime() <= now.getTime());
}

function isWrong(entry: WrongAnswerEntry, meta?: QuestionMeta): boolean {
  return Boolean(
    meta?.mistakeAnalysis?.causes.length ||
    meta?.needsReview ||
    entry.reviewAttempts?.some((attempt) => normalizeQuestionNumber(attempt.questionNumber) === normalizeQuestionNumber(meta?.questionNumber ?? "") && !attempt.correct),
  );
}

function isMastered(entry: WrongAnswerEntry, meta?: QuestionMeta): boolean {
  return meta?.review?.phase === "archived" || (!meta && entry.mastered);
}

function makeItem(entry: WrongAnswerEntry, number: string, text: string, choices: number, now: Date, source?: { page?: number }, figureIds: string[] = [], questionStatus?: ResolvedEntryQuestion["processingStatus"], questionNeedsReview = false): QuestionBankItem {
  const meta = findMeta(entry, number);
  const answer = findAnswer(entry, number);
  const classification = resolveQuestionClassification(entry, meta);
  const resolvedAnswerType = classification.answerType ?? (choices ? "multiple_choice" : "unknown");
  const resolvedQuestion = {
    questionNumber: number,
    figureIds,
    source,
    processingStatus: questionStatus,
  } satisfies Pick<ResolvedEntryQuestion, "questionNumber" | "figureIds" | "source" | "processingStatus">;
  const assets = resolveQuestionAssets(entry, resolvedQuestion);
  const images = unique([...assets.sourceCrops.map((crop) => crop.image), ...assets.figureAssets]);
  const sourcePages = assets.sourcePages;
  const figuresNeedReview = resolveQuestionFigures(entry, resolvedQuestion).some((figure) => figure.processingStatus === "needs_review" || figure.processingStatus === "rejected" || figure.needsReview);
  const answerText = answer?.answer?.trim() || (entry.entryKind === "wrong_answer" ? entry.correctAnswer.trim() : "");
  const explanation = [answer?.explanation, answer?.strategy, ...(answer?.steps ?? []), ...(entry.entryKind === "wrong_answer" ? entry.explanationParts.map((part) => part.text) : [])]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n")
    .trim();
  return {
    id: `${entry.id}:${normalizeQuestionNumber(number) || "entry"}`,
    entryId: entry.id,
    entryTitle: entry.title || "(제목 없음)",
    entryKind: entry.entryKind,
    questionNumber: normalizeQuestionNumber(number) || number,
    questionId: answer?.id,
    subject: classification.subject,
    questionText: text,
    source: resolveProblemSource(entry.problemSource),
    classification: { ...classification, answerType: resolvedAnswerType },
    answer: answerText || undefined,
    explanation: explanation || undefined,
    questionImages: images,
    sourcePageImages: sourcePages,
    hasAnswer: Boolean(answerText),
    hasExplanation: Boolean(explanation),
    hasImages: images.length > 0 || sourcePages.length > 0,
    isWrong: isWrong(entry, meta),
    isImportant: meta?.important === true,
    needsReview: Boolean(meta?.needsReview || answer?.needsReview || answer?.processingStatus === "needs_review" || answer?.processingStatus === "rejected" || questionNeedsReview || questionStatus === "needs_review" || questionStatus === "rejected" || figuresNeedReview),
    isMastered: isMastered(entry, meta),
    reviewDue: reviewDue(meta, now),
    updatedAt: entry.updatedAt,
  };
}

export function buildQuestionBankItems(entries: WrongAnswerEntry[], now = new Date()): QuestionBankItem[] {
  return entries.flatMap((entry) => {
    if (entry.entryKind === "problem_sheet") {
      return getEntryQuestions(entry)
        .map((block) => makeItem(entry, block.questionNumber, [block.questionText, ...block.choices].filter(Boolean).join("\n"), block.choices.length, now, block.source, block.figureIds, block.processingStatus, block.needsReview));
    }
    if (entry.entryKind !== "wrong_answer" || !entry.question.trim()) return [];
    const number = normalizeQuestionMeta(entry.questionMeta)[0]?.questionNumber
      ?? entry.answerKey?.[0]?.questionNumber
      ?? "1";
    const parsed = parseQuestionText(entry.question).find((block): block is QuestionBlock => block.kind === "question");
    return [makeItem(entry, number, entry.question.trim(), parsed?.choices.length ?? 0, now)];
  });
}
