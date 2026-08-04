import type { QuestionBlock } from "../../../utils/textLayout";
import { parseQuestionText } from "../../../utils/textLayout";
import { normalizeQuestionMeta, normalizeQuestionNumber } from "../../../utils/questionMeta";
import { resolveQuestionClassification } from "../../../utils/questionClassification";
import { resolveProblemSource } from "../../../utils/problemSource";
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

function questionImages(entry: WrongAnswerEntry, number: string): string[] {
  const key = normalizeQuestionNumber(number);
  const figures = (entry.figures ?? [])
    .filter((figure) => normalizeQuestionNumber(figure.questionNumber) === key)
    .flatMap((figure) => [figure.image, figure.original?.image, figure.cleaned?.image]);
  return unique([...entry.questionImages, ...figures]);
}

function questionText(block: QuestionBlock): string {
  const choices = block.choices.map((choice) => `${choice.marker} ${choice.text}`.trim());
  return [block.body, ...choices].filter(Boolean).join("\n").trim();
}

function reviewDue(meta: QuestionMeta | undefined, now: Date): boolean {
  const dueAt = meta?.review?.dueAt;
  return Boolean(dueAt && new Date(dueAt).getTime() <= now.getTime());
}

function isWrong(entry: WrongAnswerEntry, meta?: QuestionMeta): boolean {
  return Boolean(
    meta?.mistakeAnalysis?.causes.length ||
    meta?.needsReview ||
    entry.reviewAttempts?.some((attempt) => attempt.questionNumber === meta?.questionNumber && !attempt.correct),
  );
}

function isMastered(entry: WrongAnswerEntry, meta?: QuestionMeta): boolean {
  return meta?.review?.phase === "archived" || (!meta && entry.mastered);
}

function makeItem(entry: WrongAnswerEntry, number: string, text: string, choices: number, now: Date): QuestionBankItem {
  const meta = findMeta(entry, number);
  const answer = findAnswer(entry, number);
  const classification = resolveQuestionClassification(entry, meta);
  const resolvedAnswerType = classification.answerType ?? (choices ? "multiple_choice" : "unknown");
  const images = questionImages(entry, number);
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
    sourcePageImages: [...(entry.sourcePageImages ?? [])],
    hasAnswer: Boolean(answerText),
    hasExplanation: Boolean(explanation),
    hasImages: images.length > 0 || (entry.sourcePageImages?.length ?? 0) > 0,
    isWrong: isWrong(entry, meta),
    isMastered: isMastered(entry, meta),
    reviewDue: reviewDue(meta, now),
    updatedAt: entry.updatedAt,
  };
}

export function buildQuestionBankItems(entries: WrongAnswerEntry[], now = new Date()): QuestionBankItem[] {
  return entries.flatMap((entry) => {
    if (entry.entryKind === "problem_sheet") {
      return parseQuestionText(entry.question)
        .filter((block): block is QuestionBlock => block.kind === "question")
        .map((block) => makeItem(entry, block.numberLabel || String(block.displayNumber), questionText(block), block.choices.length, now));
    }
    if (entry.entryKind !== "wrong_answer" || !entry.question.trim()) return [];
    const number = normalizeQuestionMeta(entry.questionMeta)[0]?.questionNumber
      ?? entry.answerKey?.[0]?.questionNumber
      ?? "1";
    const parsed = parseQuestionText(entry.question).find((block): block is QuestionBlock => block.kind === "question");
    return [makeItem(entry, number, entry.question.trim(), parsed?.choices.length ?? 0, now)];
  });
}
