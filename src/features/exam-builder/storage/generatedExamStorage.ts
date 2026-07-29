import type { GeneratedExam } from "../../../types";
import type { WrongAnswerEntry } from "../../../types";
import { normalizeGeneratedExamSources } from "../services/questionSource";
import { readStorageJson, writeStorageJson } from "../../../services/storageJson";

export const GENERATED_EXAMS_STORAGE_KEY = "wrong-answer-generated-exams";

export function loadGeneratedExams(storage: Storage = localStorage, entries: WrongAnswerEntry[] = []): GeneratedExam[] {
  const value = readStorageJson(storage, GENERATED_EXAMS_STORAGE_KEY, Array.isArray);
  return value === null ? [] : (value as GeneratedExam[]).map((exam) => normalizeGeneratedExamSources(exam, entries));
}

export function saveGeneratedExams(exams: GeneratedExam[], storage: Storage = localStorage): void {
  writeStorageJson(storage, GENERATED_EXAMS_STORAGE_KEY, exams);
}

export function mergeGeneratedExam(exams: GeneratedExam[], exam: GeneratedExam): GeneratedExam[] {
  return [...exams.filter((item) => item.id !== exam.id), exam];
}
