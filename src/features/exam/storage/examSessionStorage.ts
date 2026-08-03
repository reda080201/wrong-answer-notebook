import type { ExamSession } from "../../../types";
import { readStorageJson, writeStorageJson } from "../../../services/storageJson";

export const EXAM_SESSIONS_STORAGE_KEY = "wrong-answer-exam-sessions";
export const EXAM_SESSION_AUTOSAVE_DEBOUNCE_MS = 350;

export function mergeExamSession(sessions: ExamSession[], session: ExamSession): ExamSession[] {
  return [...sessions.filter((item) => item.id !== session.id), session];
}

export function loadExamSessions(storage: Storage = localStorage): ExamSession[] {
  return readStorageJson(storage, EXAM_SESSIONS_STORAGE_KEY, Array.isArray) as ExamSession[] ?? [];
}

export function saveExamSessions(sessions: ExamSession[], storage: Storage = localStorage): void {
  writeStorageJson(storage, EXAM_SESSIONS_STORAGE_KEY, sessions);
}
