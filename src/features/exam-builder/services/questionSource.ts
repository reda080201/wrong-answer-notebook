import type { GeneratedExamQuestion, QuestionSourceReference, QuestionSourceStatus, WrongAnswerEntry } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

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
  if (question.source?.sourceEntryId) return question;
  const entryId = question.sourceEntryId ?? question.snapshot.sourceEntryId ?? "";
  const number = question.sourceQuestionNumber ?? question.snapshot.sourceQuestionNumber ?? question.snapshot.questionNumber;
  const entry = entries.find((item) => item.id === entryId);
  const source: QuestionSourceReference = entry
    ? createQuestionSource(entry, number, question.snapshot)
    : { sourceEntryId: entryId, sourceEntryTitle: "출처 미확인", sourceQuestionNumber: number, sourceStatus: entryId ? "snapshot_only" : "unknown" };
  return { ...question, source, sourceEntryId: undefined, sourceQuestionNumber: undefined };
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
