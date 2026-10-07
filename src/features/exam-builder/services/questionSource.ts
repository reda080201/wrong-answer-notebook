import type { GeneratedExamQuestion, QuestionSourceReference, QuestionSourceStatus, WrongAnswerEntry } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { getEntryQuestions } from "../../../utils/entryQuestions";

function hydrateExplicitSourcePages(question: GeneratedExamQuestion, entry: WrongAnswerEntry): GeneratedExamQuestion {
  const number = normalizeQuestionNumber(question.source?.sourceQuestionNumber ?? question.sourceQuestionNumber ?? question.snapshot.sourceQuestionNumber ?? question.snapshot.questionNumber);
  if (!number) return question;
  const matches = getEntryQuestions(entry).filter((item) => normalizeQuestionNumber(item.questionNumber) === number);
  if (matches.length !== 1) return question;
  const sourceQuestion = matches[0];
  const pages = entry.sourcePageImages ?? [];
  const page = sourceQuestion.source?.page;
  const validPage = Number.isInteger(page) && (page ?? 0) > 0 && (page ?? 0) <= pages.length ? page : undefined;
  const snapshotPages = question.snapshot.sourcePageImages ?? [];
  const snapshotPage = question.snapshot.source?.page;
  const hasSnapshotPage = Number.isInteger(snapshotPage)
    && (snapshotPage ?? 0) > 0 && (snapshotPage ?? 0) <= snapshotPages.length;
  // A saved index belongs to its saved page list. Preserve that association;
  // recover missing associations by filename before assigning a new index.
  const sourceFilename = hasSnapshotPage
    ? snapshotPages[(snapshotPage ?? 1) - 1]
    : validPage ? pages[validPage - 1] : undefined;
  const sourcePageImages = sourceFilename && !hasSnapshotPage
    ? [...new Set([...snapshotPages, ...pages])]
    : snapshotPages;
  const resolvedPage = sourceFilename ? sourcePageImages.indexOf(sourceFilename) + 1 : snapshotPage;
  const linkedCropPages = (entry.questionSourceCrops ?? [])
    .filter((crop) => normalizeQuestionNumber(crop.questionNumber) === number)
    .flatMap((crop) => {
      const explicitName = crop.sourcePageImage && pages.includes(crop.sourcePageImage) ? [crop.sourcePageImage] : [];
      const explicitPage = Number.isInteger(crop.page) && (crop.page ?? 0) > 0 && (crop.page ?? 0) <= pages.length ? [pages[(crop.page ?? 1) - 1]] : [];
      return [...explicitName, ...explicitPage];
    });
  const linkedSourcePageImages = [...new Set([...(question.snapshot.linkedSourcePageImages ?? []), ...linkedCropPages])];
  if (resolvedPage === snapshotPage && sourcePageImages.length === snapshotPages.length
    && linkedSourcePageImages.length === (question.snapshot.linkedSourcePageImages ?? []).length) return question;
  return {
    ...question,
    snapshot: {
      ...question.snapshot,
      source: resolvedPage ? { ...question.snapshot.source, page: resolvedPage } : question.snapshot.source,
      sourcePageImages: sourcePageImages.length ? sourcePageImages : question.snapshot.sourcePageImages,
      linkedSourcePageImages: linkedSourcePageImages.length ? linkedSourcePageImages : question.snapshot.linkedSourcePageImages,
    },
  };
}

export function questionSnapshotHash(question: { question: string; choices: string[] }): string {
  let hash = 2166136261;
  const value = `${question.question.trim()}\n${question.choices.join("|").trim()}`;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

export function createQuestionSource(entry: WrongAnswerEntry, questionNumber: string, snapshot: { question: string; choices: string[] }): QuestionSourceReference {
  return {
    sourceEntryId: entry.id,
    sourceEntryTitle: entry.title || "출처 미확인",
    sourceQuestionNumber: questionNumber,
    sourceSubject: entry.subject || undefined,
    sourceExamName: entry.sheetGroup?.groupTitle,
    sourceSection: entry.sheetGroup?.partTitle,
    sourceTags: [...entry.tags],
    sourceSnapshotHash: questionSnapshotHash(snapshot),
    sourceStatus: "linked",
  };
}

export function migrateQuestionSource(question: GeneratedExamQuestion, entries: WrongAnswerEntry[]): GeneratedExamQuestion {
  const entryId = question.sourceEntryId ?? question.snapshot.sourceEntryId ?? "";
  const storedEntryId = question.source?.sourceEntryId || entryId;
  const existingEntry = entries.find((item) => item.id === storedEntryId);
  if (question.source?.sourceEntryId) return existingEntry ? hydrateExplicitSourcePages(question, existingEntry) : question;
  const number = question.sourceQuestionNumber ?? question.snapshot.sourceQuestionNumber ?? question.snapshot.questionNumber;
  const entry = entries.find((item) => item.id === entryId);
  const source: QuestionSourceReference = entry
    ? createQuestionSource(entry, number, question.snapshot)
    : { sourceEntryId: entryId, sourceEntryTitle: "출처 미확인", sourceQuestionNumber: number, sourceStatus: entryId ? "snapshot_only" : "unknown" };
  const migrated = { ...question, source, sourceEntryId: undefined, sourceQuestionNumber: undefined };
  return entry ? hydrateExplicitSourcePages(migrated, entry) : migrated;
}

export function normalizeGeneratedExamSources(exam: import("../../../types").GeneratedExam, entries: WrongAnswerEntry[]): import("../../../types").GeneratedExam {
  return { ...exam, questions: exam.questions.map((question) => migrateQuestionSource(question, entries)) };
}

export function resolveQuestionSourceStatus(source: QuestionSourceReference, entries: WrongAnswerEntry[]): QuestionSourceStatus {
  const entry = entries.find((item) => item.id === source.sourceEntryId);
  if (!entry) return source.sourceEntryId ? "missing" : "unknown";
  const block = entry.question.includes(source.sourceQuestionNumber) || entry.answerKey?.some((item) => normalizeQuestionNumber(item.questionNumber) === normalizeQuestionNumber(source.sourceQuestionNumber));
  return block ? "linked" : "snapshot_only";
}

export function formatQuestionSourceLabel(source: QuestionSourceReference): string {
  const title = source.sourceEntryTitle?.trim() || "출처 미확인";
  const number = source.sourceQuestionNumber?.trim() || "?";
  return `${title} ${number}번`;
}

export function sourceStatusLabel(status: QuestionSourceStatus): string {
  return status === "linked" ? "원본 연결됨" : status === "missing" ? "원본 삭제됨" : status === "snapshot_only" ? "snapshot 보존" : "출처 확인 불가";
}
