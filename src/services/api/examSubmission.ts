import type {
  ExamSession,
  ExamSubmissionTransactionInput,
  ExamSubmissionTransactionResult,
  WrongAnswerEntry,
} from "../../types";
import { normalizeEntry } from "../../utils/entry";
import { normalizeQuestionNumber } from "../../utils/questionMeta";
import { EXAM_SESSIONS_STORAGE_KEY } from "../../features/exam/storage/examSessionStorage";
import { ENTRIES_SCHEMA_VERSION, ENTRIES_STORAGE_KEY, errorMessage, parseStoredEntries, type StoredEntriesDocument } from "./shared";
import { getStorageBackend } from "../storageBackend";

const JOURNAL_KEY = "wrong-answer-exam-submission-journal";

interface BrowserExamSubmissionJournal {
  version: 1;
  beforeEntries: string | null;
  beforeSessions: string | null;
  afterEntries: string;
  afterSessions: string;
}

function parseSessions(raw: string | null): ExamSession[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("모의고사 세션 저장 형식이 올바르지 않습니다. 배열이어야 합니다.");
  return value as ExamSession[];
}

function restoreRaw(key: string, value: string | null): void {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

function entryKey(entry: WrongAnswerEntry): string | null {
  if (!entry.generatedFromExamSessionId || !entry.generatedFromQuestionNumber) return null;
  const number = normalizeQuestionNumber(entry.generatedFromQuestionNumber);
  return number ? `${entry.generatedFromExamSessionId}:${number}` : null;
}

function resultFromRaw(entriesRaw: string, sessionsRaw: string, addedEntryIds: string[]): ExamSubmissionTransactionResult {
  const entries = parseStoredEntries(JSON.parse(entriesRaw)).map(normalizeEntry);
  const sessions = parseSessions(sessionsRaw);
  return { entries, sessions, addedEntryIds };
}

/** Roll a crashed browser transaction forward. Multi-tab coordination is intentionally separate. */
export function reconcileBrowserExamSubmissionJournal(storage: Storage = localStorage): void {
  const raw = storage.getItem(JOURNAL_KEY);
  if (!raw) return;
  let journal: BrowserExamSubmissionJournal;
  try {
    journal = JSON.parse(raw) as BrowserExamSubmissionJournal;
    if (journal.version !== 1 || typeof journal.afterEntries !== "string" || typeof journal.afterSessions !== "string") {
      throw new Error("invalid journal");
    }
    parseStoredEntries(JSON.parse(journal.afterEntries));
    parseSessions(journal.afterSessions);
  } catch (cause) {
    throw new Error("시험 제출 복구 journal이 손상되었습니다. journal을 보존하고 저장을 차단합니다.", { cause });
  }
  storage.setItem(ENTRIES_STORAGE_KEY, journal.afterEntries);
  storage.setItem(EXAM_SESSIONS_STORAGE_KEY, journal.afterSessions);
  storage.removeItem(JOURNAL_KEY);
}

function commitBrowserExamSubmission(input: ExamSubmissionTransactionInput): ExamSubmissionTransactionResult {
  reconcileBrowserExamSubmissionJournal();
  const beforeEntries = localStorage.getItem(ENTRIES_STORAGE_KEY);
  const beforeSessions = localStorage.getItem(EXAM_SESSIONS_STORAGE_KEY);
  const existingEntries = beforeEntries === null ? [] : parseStoredEntries(JSON.parse(beforeEntries));
  const knownKeys = new Set(existingEntries.map(entryKey).filter((value): value is string => Boolean(value)));
  const addedEntries: WrongAnswerEntry[] = [];
  for (const entry of input.derivedEntries) {
    const key = entryKey(entry);
    if (key && knownKeys.has(key)) continue;
    if (key) knownKeys.add(key);
    addedEntries.push(entry);
  }
  const entriesDocument: StoredEntriesDocument = {
    schemaVersion: ENTRIES_SCHEMA_VERSION,
    entries: [...addedEntries, ...existingEntries],
  };
  const sessions = parseSessions(beforeSessions)
    .filter((session) => session.id !== input.submittedSession.id)
    .concat(input.submittedSession);
  const afterEntries = JSON.stringify(entriesDocument);
  const afterSessions = JSON.stringify(sessions);
  const journal: BrowserExamSubmissionJournal = { version: 1, beforeEntries, beforeSessions, afterEntries, afterSessions };
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  try {
    localStorage.setItem(ENTRIES_STORAGE_KEY, afterEntries);
    localStorage.setItem(EXAM_SESSIONS_STORAGE_KEY, afterSessions);
    localStorage.removeItem(JOURNAL_KEY);
  } catch (cause) {
    try {
      restoreRaw(ENTRIES_STORAGE_KEY, beforeEntries);
      restoreRaw(EXAM_SESSIONS_STORAGE_KEY, beforeSessions);
      localStorage.removeItem(JOURNAL_KEY);
    } catch {
      // Keep the journal when rollback cannot complete; next startup will roll forward.
    }
    throw cause;
  }
  return resultFromRaw(afterEntries, afterSessions, addedEntries.map((entry) => entry.id));
}

export async function commitExamSubmission(input: ExamSubmissionTransactionInput): Promise<ExamSubmissionTransactionResult> {
  try {
    const backend = getStorageBackend();
    if (backend.kind !== "isolated-browser") {
      const result = await backend.commitExamSubmission(input);
      return {
        entries: result.entries.map(normalizeEntry),
        sessions: result.sessions,
        addedEntryIds: result.addedEntryIds,
      };
    }
    return commitBrowserExamSubmission(input);
  } catch (cause) {
    throw new Error(errorMessage(cause, "시험 제출 결과를 저장하지 못했습니다."), { cause });
  }
}
