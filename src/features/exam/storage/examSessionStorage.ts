import type { ExamSession } from "../../../types";

export const EXAM_SESSIONS_STORAGE_KEY = "wrong-answer-exam-sessions";

export function loadExamSessions(storage: Storage = localStorage): ExamSession[] {
  try {
    const value = JSON.parse(storage.getItem(EXAM_SESSIONS_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value as ExamSession[] : [];
  } catch {
    return [];
  }
}

export function saveExamSessions(sessions: ExamSession[], storage: Storage = localStorage): void {
  storage.setItem(EXAM_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
}
