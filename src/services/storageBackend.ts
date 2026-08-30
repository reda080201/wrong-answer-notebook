import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  AppSettings,
  ExamSession,
  ExamSubmissionTransactionInput,
  ExamSubmissionTransactionResult,
  GeneratedExam,
  WrongAnswerEntry,
  ReviewSession,
  PendingDeletion,
} from "../types";
import type { LibraryFolder } from "../models/library";
import type { GptSolutionRoundtripDraft } from "../features/gpt-solution-roundtrip/model";
import type { ImportWorkspace } from "../features/import-workspace/model/importWorkspace";
import { readStorageJson, writeStorageJson } from "./storageJson";
import {
  ENTRIES_SCHEMA_VERSION,
  ENTRIES_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  parseStoredEntries,
} from "./api/shared";
import { EXAM_SESSIONS_STORAGE_KEY } from "../features/exam/storage/examSessionStorage";
import { GENERATED_EXAMS_STORAGE_KEY } from "../features/exam-builder/storage/generatedExamStorage";
import { LIBRARY_FOLDERS_STORAGE_KEY } from "./api/libraryFolders";
import { GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY } from "../features/gpt-solution-roundtrip/storage/gptSolutionRoundtripStorage";
import { REVIEW_SESSIONS_STORAGE_KEY, normalizeReviewSession } from "../features/review/storage/reviewSessionStorage";

export type StorageBackendKind = "tauri" | "desktop-proxy" | "isolated-browser";

export const IMPORT_WORKSPACE_DRAFT_STORAGE_KEY = "wrong-answer-import-workspace-draft";

export interface StorageBackend {
  readonly kind: StorageBackendKind;
  loadEntries(): Promise<WrongAnswerEntry[]>;
  saveEntries(entries: WrongAnswerEntry[]): Promise<void>;
  loadSettings(): Promise<AppSettings | null>;
  saveSettings(settings: AppSettings): Promise<void>;
  loadExamSessions(): Promise<ExamSession[]>;
  saveExamSessions(sessions: ExamSession[]): Promise<void>;
  loadGeneratedExams(): Promise<GeneratedExam[]>;
  saveGeneratedExams(exams: GeneratedExam[]): Promise<void>;
  loadLibraryFolders(): Promise<LibraryFolder[]>;
  saveLibraryFolders(folders: LibraryFolder[]): Promise<void>;
  loadGptSolutionDrafts(): Promise<GptSolutionRoundtripDraft[]>;
  saveGptSolutionDrafts(drafts: GptSolutionRoundtripDraft[]): Promise<void>;
  loadReviewSessions?(): Promise<ReviewSession[]>;
  saveReviewSessions?(sessions: ReviewSession[]): Promise<void>;
  loadPendingDeletions?(): Promise<PendingDeletion[]>;
  savePendingDeletions?(deletions: PendingDeletion[]): Promise<void>;
  loadImportWorkspaceDraft(): Promise<ImportWorkspace | null>;
  saveImportWorkspaceDraft(draft: ImportWorkspace): Promise<void>;
  clearImportWorkspaceDraft(): Promise<void>;
  commitExamSubmission(input: ExamSubmissionTransactionInput): Promise<ExamSubmissionTransactionResult>;
}

type StoreName =
  | "entries"
  | "settings"
  | "exam-sessions"
  | "generated-exams"
  | "library-folders"
  | "gpt-solution-drafts"
  | "review-sessions"
  | "pending-deletions"
  | "import-workspace-draft";

const proxyUrl = import.meta.env.VITE_DESKTOP_STORAGE_BRIDGE_URL?.replace(/\/$/, "");
const proxyToken = import.meta.env.VITE_DESKTOP_STORAGE_BRIDGE_TOKEN;

async function proxyRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!proxyUrl || !proxyToken) throw new Error("데스크톱 저장소 bridge 설정이 없습니다.");
  let response: Response;
  try {
    response = await fetch(`${proxyUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${proxyToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    throw new Error("데스크톱 저장소 연결이 끊어졌습니다. 저장을 중단하고 Web 실행 창을 다시 시작하세요.", { cause });
  }
  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new Error(message || `데스크톱 저장소 요청이 실패했습니다. (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function proxyLoad<T>(name: StoreName): Promise<T> {
  return proxyRequest<T>(`/v1/stores/${name}`);
}

async function proxySave(name: StoreName, value: unknown): Promise<void> {
  await proxyRequest(`/v1/stores/${name}`, { method: "PUT", body: JSON.stringify(value) });
}

const tauriBackend: StorageBackend = {
  kind: "tauri",
  loadEntries: () => invoke("load_entries"),
  saveEntries: (entries) => invoke("save_entries", { entries }),
  loadSettings: () => invoke("load_settings"),
  saveSettings: (settings) => invoke("save_settings", { settings }),
  loadExamSessions: () => invoke("load_exam_sessions"),
  saveExamSessions: (sessions) => invoke("save_exam_sessions", { sessions }),
  loadGeneratedExams: () => invoke("load_generated_exams"),
  saveGeneratedExams: (exams) => invoke("save_generated_exams", { exams }),
  loadLibraryFolders: () => invoke("load_library_folders"),
  saveLibraryFolders: (folders) => invoke("save_library_folders", { folders }),
  loadGptSolutionDrafts: () => invoke("load_gpt_solution_roundtrip_drafts"),
  saveGptSolutionDrafts: (drafts) => invoke("save_gpt_solution_roundtrip_drafts", { drafts }),
  loadReviewSessions: async () => (await invoke<ReviewSession[]>("load_review_sessions")).map(normalizeReviewSession),
  saveReviewSessions: (sessions) => invoke("save_review_sessions", { sessions }),
  loadPendingDeletions: () => invoke("load_pending_deletions"),
  savePendingDeletions: (deletions) => invoke("save_pending_deletions", { deletions }),
  async loadImportWorkspaceDraft() {
    const remote = await invoke<ImportWorkspace | null>("load_import_workspace_draft");
    if (remote) return remote;
    const legacy = readStorageJson<ImportWorkspace>(localStorage, IMPORT_WORKSPACE_DRAFT_STORAGE_KEY, isImportWorkspace);
    if (!legacy) return null;
    await invoke("save_import_workspace_draft", { draft: legacy });
    localStorage.removeItem(IMPORT_WORKSPACE_DRAFT_STORAGE_KEY);
    return legacy;
  },
  saveImportWorkspaceDraft: (draft) => invoke("save_import_workspace_draft", { draft }),
  clearImportWorkspaceDraft: () => invoke("clear_import_workspace_draft"),
  commitExamSubmission: (input) => invoke("submit_exam_transaction", { input }),
};

const proxyBackend: StorageBackend = {
  kind: "desktop-proxy",
  loadEntries: () => proxyLoad("entries"),
  saveEntries: (entries) => proxySave("entries", entries),
  loadSettings: () => proxyLoad("settings"),
  saveSettings: (settings) => proxySave("settings", settings),
  loadExamSessions: () => proxyLoad("exam-sessions"),
  saveExamSessions: (sessions) => proxySave("exam-sessions", sessions),
  loadGeneratedExams: () => proxyLoad("generated-exams"),
  saveGeneratedExams: (exams) => proxySave("generated-exams", exams),
  loadLibraryFolders: () => proxyLoad("library-folders"),
  saveLibraryFolders: (folders) => proxySave("library-folders", folders),
  loadGptSolutionDrafts: () => proxyLoad("gpt-solution-drafts"),
  saveGptSolutionDrafts: (drafts) => proxySave("gpt-solution-drafts", drafts),
  loadReviewSessions: async () => (await proxyLoad<ReviewSession[]>("review-sessions")).map(normalizeReviewSession),
  saveReviewSessions: (sessions) => proxySave("review-sessions", sessions),
  loadPendingDeletions: () => proxyLoad("pending-deletions"),
  savePendingDeletions: (deletions) => proxySave("pending-deletions", deletions),
  async loadImportWorkspaceDraft() {
    const remote = await proxyLoad<ImportWorkspace | null>("import-workspace-draft");
    if (remote) return remote;
    const legacy = readStorageJson<ImportWorkspace>(localStorage, IMPORT_WORKSPACE_DRAFT_STORAGE_KEY, isImportWorkspace);
    if (!legacy) return null;
    await proxySave("import-workspace-draft", legacy);
    localStorage.removeItem(IMPORT_WORKSPACE_DRAFT_STORAGE_KEY);
    return legacy;
  },
  saveImportWorkspaceDraft: (draft) => proxySave("import-workspace-draft", draft),
  clearImportWorkspaceDraft: () => proxyRequest("/v1/stores/import-workspace-draft", { method: "DELETE" }),
  commitExamSubmission: (input) => proxyRequest("/v1/exam-submissions", { method: "POST", body: JSON.stringify(input) }),
};

function arrayOrThrow<T>(value: unknown, name: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${name} 저장 형식이 올바르지 않습니다. 배열이어야 합니다.`);
  return value as T[];
}

function isImportWorkspace(value: unknown): value is ImportWorkspace {
  return Boolean(value && typeof value === "object" && "id" in value && "groups" in value);
}

const isolatedBrowserBackend: StorageBackend = {
  kind: "isolated-browser",
  async loadEntries() {
    const value = readStorageJson<unknown>(localStorage, ENTRIES_STORAGE_KEY, (candidate): candidate is unknown => candidate === candidate);
    return value === null ? [] : parseStoredEntries(value);
  },
  async saveEntries(entries) {
    writeStorageJson(localStorage, ENTRIES_STORAGE_KEY, { schemaVersion: ENTRIES_SCHEMA_VERSION, entries });
  },
  async loadSettings() {
    return readStorageJson<AppSettings>(localStorage, SETTINGS_STORAGE_KEY, (value): value is AppSettings => Boolean(value && typeof value === "object"));
  },
  async saveSettings(settings) { writeStorageJson(localStorage, SETTINGS_STORAGE_KEY, settings); },
  async loadExamSessions() { return arrayOrThrow(readStorageJson(localStorage, EXAM_SESSIONS_STORAGE_KEY, Array.isArray) ?? [], "모의고사 세션"); },
  async saveExamSessions(sessions) { writeStorageJson(localStorage, EXAM_SESSIONS_STORAGE_KEY, sessions); },
  async loadGeneratedExams() { return arrayOrThrow(readStorageJson(localStorage, GENERATED_EXAMS_STORAGE_KEY, Array.isArray) ?? [], "생성 모의고사"); },
  async saveGeneratedExams(exams) { writeStorageJson(localStorage, GENERATED_EXAMS_STORAGE_KEY, exams); },
  async loadLibraryFolders() { return arrayOrThrow(readStorageJson(localStorage, LIBRARY_FOLDERS_STORAGE_KEY, Array.isArray) ?? [], "폴더"); },
  async saveLibraryFolders(folders) { writeStorageJson(localStorage, LIBRARY_FOLDERS_STORAGE_KEY, folders); },
  async loadGptSolutionDrafts() { return arrayOrThrow(readStorageJson(localStorage, GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY, Array.isArray) ?? [], "GPT 해설 초안"); },
  async saveGptSolutionDrafts(drafts) { writeStorageJson(localStorage, GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY, drafts); },
  async loadReviewSessions() { return (arrayOrThrow<ReviewSession>(readStorageJson(localStorage, REVIEW_SESSIONS_STORAGE_KEY, Array.isArray) ?? [], "복습 세션")).map(normalizeReviewSession); },
  async saveReviewSessions(sessions) { writeStorageJson(localStorage, REVIEW_SESSIONS_STORAGE_KEY, sessions.map(normalizeReviewSession)); },
  async loadPendingDeletions() { return arrayOrThrow(readStorageJson(localStorage, "wrong-answer-pending-deletions", Array.isArray) ?? [], "삭제 대기 항목"); },
  async savePendingDeletions(deletions) { writeStorageJson(localStorage, "wrong-answer-pending-deletions", deletions); },
  async loadImportWorkspaceDraft() { return readStorageJson(localStorage, IMPORT_WORKSPACE_DRAFT_STORAGE_KEY, isImportWorkspace); },
  async saveImportWorkspaceDraft(draft) { writeStorageJson(localStorage, IMPORT_WORKSPACE_DRAFT_STORAGE_KEY, draft); },
  async clearImportWorkspaceDraft() { localStorage.removeItem(IMPORT_WORKSPACE_DRAFT_STORAGE_KEY); },
  async commitExamSubmission() { throw new Error("격리 브라우저 transaction adapter를 사용해야 합니다."); },
};

let overrideBackend: StorageBackend | undefined;

export function getStorageBackend(): StorageBackend {
  if (overrideBackend) return overrideBackend;
  if (isTauri()) return tauriBackend;
  if (proxyUrl || proxyToken) {
    if (!proxyUrl || !proxyToken) throw new Error("데스크톱 저장소 bridge 환경 설정이 불완전합니다.");
    return proxyBackend;
  }
  return isolatedBrowserBackend;
}

export function getStorageBackendKind(): StorageBackendKind {
  return getStorageBackend().kind;
}

export function setStorageBackendForTests(backend?: StorageBackend): void {
  overrideBackend = backend;
}

export { proxyRequest };
