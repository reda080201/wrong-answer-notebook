import type { ExamSession } from "../../../types";

export const EXAM_SESSIONS_STORAGE_KEY = "wrong-answer-exam-sessions";
export const EXAM_SESSION_AUTOSAVE_DEBOUNCE_MS = 350;

export function mergeExamSession(sessions: ExamSession[], session: ExamSession): ExamSession[] {
  return [...sessions.filter((item) => item.id !== session.id), session];
}

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
