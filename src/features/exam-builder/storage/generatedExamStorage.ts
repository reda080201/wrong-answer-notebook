import type { GeneratedExam } from "../../../types";
import type { WrongAnswerEntry } from "../../../types";
import { normalizeGeneratedExamSources } from "../services/questionSource";

export const GENERATED_EXAMS_STORAGE_KEY = "wrong-answer-generated-exams";

export function loadGeneratedExams(storage: Storage = localStorage, entries: WrongAnswerEntry[] = []): GeneratedExam[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(GENERATED_EXAMS_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? (value as GeneratedExam[]).map((exam) => normalizeGeneratedExamSources(exam, entries)) : [];
  } catch { return []; }
}

export function saveGeneratedExams(exams: GeneratedExam[], storage: Storage = localStorage): void {
  storage.setItem(GENERATED_EXAMS_STORAGE_KEY, JSON.stringify(exams));
}

export function mergeGeneratedExam(exams: GeneratedExam[], exam: GeneratedExam): GeneratedExam[] {
  return [...exams.filter((item) => item.id !== exam.id), exam];
}
