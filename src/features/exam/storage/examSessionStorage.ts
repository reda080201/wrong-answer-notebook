import type { ExamMode, ExamSession } from "../../../types";
import { readStorageJson, writeStorageJson } from "../../../services/storageJson";

export const EXAM_SESSIONS_STORAGE_KEY = "wrong-answer-exam-sessions";
export const EXAM_SESSION_AUTOSAVE_DEBOUNCE_MS = 350;

export function normalizeExamSession(session: ExamSession): ExamSession {
  const mode: ExamMode = session.mode === "real" ? "real" : "practice";
  if (mode === "practice") return { ...session, mode };
  return {
    ...session,
    mode,
    showTimer: session.showTimer !== false,
    answerSheetOpen: session.answerSheetOpen !== false,
    answerSheetLayout: session.answerSheetLayout === "vertical" || session.answerSheetLayout === "horizontal"
      ? session.answerSheetLayout
      : "auto",
  };
}

export function mergeExamSession(sessions: ExamSession[], session: ExamSession): ExamSession[] {
  return [...sessions.filter((item) => item.id !== session.id), session];
}

export function loadExamSessions(storage: Storage = localStorage): ExamSession[] {
  const sessions = readStorageJson(storage, EXAM_SESSIONS_STORAGE_KEY, Array.isArray) as ExamSession[] ?? [];
  return sessions.map(normalizeExamSession);
}

export function saveExamSessions(sessions: ExamSession[], storage: Storage = localStorage): void {
  writeStorageJson(storage, EXAM_SESSIONS_STORAGE_KEY, sessions.map(normalizeExamSession));
}
