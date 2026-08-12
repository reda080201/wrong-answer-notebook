import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AppSettings, ExamSession, GeneratedExam, IntegrityReport, OrphanImagePreview, WrongAnswerEntry } from "../../types";
import type { ImportWorkspace } from "../../features/import-workspace/model/importWorkspace";
import { isGptSolutionRoundtripDraftArray, type GptSolutionRoundtripDraft } from "../../features/gpt-solution-roundtrip/model";
import { EXAM_SESSIONS_STORAGE_KEY } from "../../features/exam/storage/examSessionStorage";
import { GENERATED_EXAMS_STORAGE_KEY } from "../../features/exam-builder/storage/generatedExamStorage";
import { isLibraryFolderArray, type LibraryFolder } from "../../models/library";
import { LIBRARY_FOLDERS_STORAGE_KEY } from "./libraryFolders";
import { GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY } from "../../features/gpt-solution-roundtrip/storage/gptSolutionRoundtripStorage";
import { getAllImageFilenames } from "../../utils/entry";
import { readStorageJson, writeStorageJson } from "../storageJson";
import { clearImageUrlCache } from "./images";
import {
  ENTRIES_STORAGE_KEY,
  ENTRIES_SCHEMA_VERSION,
  errorMessage,
  isUnknownStorageValue,
  parseStoredEntries,
  SETTINGS_STORAGE_KEY,
} from "./shared";
import { normalizeSettings } from "./settings";

const IMPORT_WORKSPACE_DRAFT_STORAGE_KEY = "wrong-answer-import-workspace-draft";

interface BrowserBackupMeta<Version extends 1 | 2> {
  version: Version;
  createdAt: string;
  source: "browser";
}

interface BrowserBackupPayloadBase {
  entries: WrongAnswerEntry[];
  settings: AppSettings;
  browserImages: Record<string, string>;
}

export interface BrowserBackupPayloadV1 extends BrowserBackupPayloadBase {
  meta: BrowserBackupMeta<1>;
}

export interface BrowserBackupPayloadV2 extends BrowserBackupPayloadBase {
  meta: BrowserBackupMeta<2>;
  examSessions: ExamSession[];
  generatedExams: GeneratedExam[];
  libraryFolders: LibraryFolder[];
  gptSolutionDrafts: GptSolutionRoundtripDraft[];
  importWorkspaceDraft: ImportWorkspace | null;
}

export type BackupPayload = BrowserBackupPayloadV1 | BrowserBackupPayloadV2;

export interface RestoreBackupResult {
  restored: true;
  warnings: string[];
}

function readBrowserBackupSnapshot(
  fallbackEntries: WrongAnswerEntry[],
  fallbackSettings: AppSettings,
): Omit<BrowserBackupPayloadV2, "meta"> {
  const storedEntries = readStorageJson(localStorage, ENTRIES_STORAGE_KEY, isUnknownStorageValue);
  const storedSettings = readStorageJson(localStorage, SETTINGS_STORAGE_KEY, isUnknownStorageValue);
  const entries = storedEntries === null ? fallbackEntries : parseStoredEntries(storedEntries);
  if (storedSettings !== null && (!storedSettings || typeof storedSettings !== "object" || Array.isArray(storedSettings))) {
    throw new Error("저장된 설정 형식이 올바르지 않습니다.");
  }
  const importWorkspaceDraft = readBrowserValue(
    IMPORT_WORKSPACE_DRAFT_STORAGE_KEY,
    isImportWorkspace,
    "가져오기 작업실 초안",
    null,
  );
  return {
    entries,
    settings: storedSettings === null ? fallbackSettings : normalizeSettings(storedSettings as AppSettings),
    browserImages: Object.fromEntries(
      Object.keys(localStorage)
        .filter((key) => key.startsWith("img_"))
        .map((key) => [key, localStorage.getItem(key) ?? ""]),
    ),
    examSessions: readBrowserArray<ExamSession>(EXAM_SESSIONS_STORAGE_KEY, "모의고사 세션"),
    generatedExams: readBrowserArray<GeneratedExam>(GENERATED_EXAMS_STORAGE_KEY, "생성 모의고사"),
    libraryFolders: readBrowserValue(LIBRARY_FOLDERS_STORAGE_KEY, isLibraryFolderArray, "폴더 목록", []),
    gptSolutionDrafts: readBrowserValue(
      GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY,
      isGptSolutionRoundtripDraftArray,
      "GPT 해설 초안",
      [],
    ),
    importWorkspaceDraft,
  };
}

function readBrowserValue<T>(
  key: string,
  guard: (value: unknown) => value is T,
  label: string,
  fallback: T,
): T {
  if (localStorage.getItem(key) === null) return fallback;
  const value = readStorageJson(localStorage, key, guard);
  if (value === null) throw new Error(`${label} 저장 형식이 올바르지 않습니다.`);
  return value;
}

function readBrowserArray<T>(key: string, label: string): T[] {
  return readBrowserValue(key, Array.isArray as (value: unknown) => value is T[], label, []);
}

function isImportWorkspace(value: unknown): value is ImportWorkspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const workspace = value as Partial<ImportWorkspace>;
  return typeof workspace.id === "string"
    && typeof workspace.createdAt === "string"
    && typeof workspace.updatedAt === "string"
    && typeof workspace.status === "string"
    && Array.isArray(workspace.sourceFiles)
    && Array.isArray(workspace.assets)
    && Array.isArray(workspace.groups)
    && Array.isArray(workspace.unassignedBlocks)
    && Array.isArray(workspace.excludedBlocks)
    && Array.isArray(workspace.warnings)
    && Number.isFinite(workspace.revision);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isImageMap(value: unknown): value is Record<string, string> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    && Object.entries(value as Record<string, unknown>).every(
      ([key, image]) => key.startsWith("img_") && typeof image === "string",
    );
}

function isBrowserBackupPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<BackupPayload>;
  if (!payload.meta || payload.meta.source !== "browser" || !isIsoDate(payload.meta.createdAt)) return false;
  if (payload.meta.version !== 1 && payload.meta.version !== 2) return false;
  const common = Array.isArray(payload.entries)
    && Boolean(payload.settings && typeof payload.settings === "object" && !Array.isArray(payload.settings))
    && isImageMap(payload.browserImages);
  if (!common || payload.meta.version === 1) return common;
  const v2 = payload as Partial<BrowserBackupPayloadV2>;
  return Array.isArray(v2.examSessions)
    && Array.isArray(v2.generatedExams)
    && isLibraryFolderArray(v2.libraryFolders)
    && isGptSolutionRoundtripDraftArray(v2.gptSolutionDrafts)
    && (v2.importWorkspaceDraft === null || isImportWorkspace(v2.importWorkspaceDraft));
}

function restoreBrowserStorageSnapshot(snapshot: Map<string, string | null>): void {
  for (const key of snapshot.keys()) localStorage.removeItem(key);
  for (const [key, value] of snapshot) {
    if (value !== null) localStorage.setItem(key, value);
  }
}

/**
 * Browser backups span entries, settings, and image keys. Keep their writes
 * all-or-nothing so quota failures cannot leave a mixed point-in-time state.
 */
export function applyBrowserBackupAtomically(payload: BackupPayload): RestoreBackupResult {
  if (isTauri()) throw new Error("브라우저 백업 복원은 데스크톱 저장소에서 사용할 수 없습니다.");
  if (!isBrowserBackupPayload(payload)) throw new Error("브라우저 백업 형식이 올바르지 않습니다.");

  const v2Payload = payload.meta.version === 2 ? payload as BrowserBackupPayloadV2 : null;
  const managedKeys = new Set([
    ENTRIES_STORAGE_KEY,
    SETTINGS_STORAGE_KEY,
    ...Object.keys(localStorage).filter((key) => key.startsWith("img_")),
    ...Object.keys(payload.browserImages),
  ]);
  if (v2Payload) {
    managedKeys.add(EXAM_SESSIONS_STORAGE_KEY);
    managedKeys.add(GENERATED_EXAMS_STORAGE_KEY);
    managedKeys.add(LIBRARY_FOLDERS_STORAGE_KEY);
    managedKeys.add(GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY);
    managedKeys.add(IMPORT_WORKSPACE_DRAFT_STORAGE_KEY);
  }
  const previous = new Map([...managedKeys].map((key) => [key, localStorage.getItem(key)]));

  try {
    for (const key of managedKeys) localStorage.removeItem(key);
    writeStorageJson(localStorage, ENTRIES_STORAGE_KEY, {
      schemaVersion: ENTRIES_SCHEMA_VERSION,
      entries: payload.entries,
    });
    writeStorageJson(localStorage, SETTINGS_STORAGE_KEY, normalizeSettings(payload.settings));
    for (const [key, image] of Object.entries(payload.browserImages)) {
      localStorage.setItem(key, image);
    }
    if (v2Payload) {
      writeStorageJson(localStorage, EXAM_SESSIONS_STORAGE_KEY, v2Payload.examSessions);
      writeStorageJson(localStorage, GENERATED_EXAMS_STORAGE_KEY, v2Payload.generatedExams);
      writeStorageJson(localStorage, LIBRARY_FOLDERS_STORAGE_KEY, v2Payload.libraryFolders);
      writeStorageJson(localStorage, GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY, v2Payload.gptSolutionDrafts);
      if (v2Payload.importWorkspaceDraft) {
        writeStorageJson(localStorage, IMPORT_WORKSPACE_DRAFT_STORAGE_KEY, v2Payload.importWorkspaceDraft);
      }
    }
    clearImageUrlCache();
  } catch (error) {
    try {
      restoreBrowserStorageSnapshot(previous);
      clearImageUrlCache();
    } catch (rollbackError) {
      throw new Error("백업 복원과 원래 데이터 복구에 모두 실패했습니다.", {
        cause: rollbackError,
      });
    }
    throw new Error(errorMessage(error, "브라우저 백업을 복원하지 못했습니다."), { cause: error });
  }
  return {
    restored: true,
    warnings: v2Payload ? [] : ["이 v1 백업에는 오답·설정·이미지만 포함되어 나머지 브라우저 저장소는 유지했습니다."],
  };
}

export async function selectBackupDestination(): Promise<string | null> {
  if (!isTauri()) return null;
  const backupPath = await save({
    title: "백업 저장",
    defaultPath: `wrong-answer-backup-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  return typeof backupPath === "string" ? backupPath : null;
}

export async function selectBackupSource(): Promise<string | File | null> {
  if (isTauri()) {
    const selected = await open({ multiple: false, filters: [{ name: "ZIP", extensions: ["zip"] }] });
    return typeof selected === "string" ? selected : null;
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export async function createBackupAtDestination(
  backupPath: string | null,
  entries: WrongAnswerEntry[],
  settings: AppSettings,
): Promise<string> {
  if (isTauri()) {
    if (!backupPath) return "백업이 취소되었습니다.";
    await invoke("create_backup_zip", { backupPath });
    return `백업을 저장했습니다: ${backupPath}`;
  }
  const snapshot = readBrowserBackupSnapshot(entries, settings);
  const payload: BackupPayload = {
    meta: { version: 2, createdAt: new Date().toISOString(), source: "browser" },
    ...snapshot,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wrong-answer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return "브라우저 백업 파일을 내려받았습니다.";
}

export async function restoreBackupFromSource(source: string | File): Promise<BackupPayload | RestoreBackupResult> {
  if (isTauri()) {
    const restored = await invoke<RestoreBackupResult>("restore_backup_zip", { backupPath: source });
    clearImageUrlCache();
    return restored;
  }
  if (!(source instanceof File)) throw new Error("브라우저 백업 파일을 찾을 수 없습니다.");
  const payload: unknown = JSON.parse(await source.text());
  if (!isBrowserBackupPayload(payload)) throw new Error("브라우저 백업 형식이 올바르지 않습니다.");
  return payload;
}

export async function createBackup(
  entries: WrongAnswerEntry[],
  settings: AppSettings,
  beforeSnapshot?: () => Promise<void>,
): Promise<string> {
  try {
    if (isTauri()) {
      const backupPath = await selectBackupDestination();
      if (!backupPath) return "백업이 취소되었습니다.";
      await beforeSnapshot?.();
      return createBackupAtDestination(backupPath, entries, settings);
    }

    await beforeSnapshot?.();
    return createBackupAtDestination(null, entries, settings);
  } catch (error) {
    throw new Error(errorMessage(error, "백업을 만들지 못했습니다."), {
      cause: error,
    });
  }
}

export async function restoreBackup(
  beforeRestore?: () => Promise<void>,
): Promise<BackupPayload | RestoreBackupResult | null> {
  try {
    if (isTauri()) {
      const selected = await selectBackupSource();
      if (!selected || Array.isArray(selected)) return null;
      await beforeRestore?.();
      return restoreBackupFromSource(selected);
    }

    const selected = await selectBackupSource();
    if (!selected) return null;
    await beforeRestore?.();
    return restoreBackupFromSource(selected);
  } catch (error) {
    throw new Error(errorMessage(error, "백업을 복원하지 못했습니다."), {
      cause: error,
    });
  }
}

export async function runNativeIntegrityCheck(): Promise<IntegrityReport | null> {
  if (!isTauri()) return null;
  return invoke<IntegrityReport>("run_integrity_check");
}

export async function previewOrphanImages(): Promise<OrphanImagePreview> {
  if (isTauri()) {
    return invoke<OrphanImagePreview>("preview_orphan_images");
  }

  const stored = readStorageJson(localStorage, ENTRIES_STORAGE_KEY, isUnknownStorageValue);
  const entries = stored === null ? [] : parseStoredEntries(stored);
  const referenced = new Set(entries.flatMap(getAllImageFilenames));
  const filenames = Object.keys(localStorage).filter((key) => key.startsWith("img_") && !referenced.has(key));
  const totalBytes = filenames.reduce((sum, filename) => sum + (localStorage.getItem(filename)?.length ?? 0), 0);
  return { filenames, totalBytes };
}

export async function cleanupOrphanImages(): Promise<number> {
  if (isTauri()) {
    return invoke<number>("cleanup_orphan_images");
  }

  const stored = readStorageJson(localStorage, ENTRIES_STORAGE_KEY, isUnknownStorageValue);
  const entries = stored === null ? [] : parseStoredEntries(stored);
  const referenced = new Set(entries.flatMap(getAllImageFilenames));
  let removed = 0;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("img_") && !referenced.has(key)) {
      localStorage.removeItem(key);
      clearImageUrlCache(key);
      removed += 1;
    }
  }
  return removed;
}

export async function createAutoBackup(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string>("create_auto_backup");
}

export async function createPreUpdateBackup(fromVersion: string, toVersion: string): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string>("create_pre_update_backup", { fromVersion, toVersion });
}
