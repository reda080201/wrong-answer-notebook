import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AppSettings, IntegrityReport, OrphanImagePreview, WrongAnswerEntry } from "../../types";
import { getAllImageFilenames } from "../../utils/entry";
import { readStorageJson } from "../storageJson";
import { clearImageUrlCache } from "./images";
import {
  ENTRIES_STORAGE_KEY,
  errorMessage,
  isUnknownStorageValue,
  parseStoredEntries,
} from "./shared";

export interface BackupPayload {
  meta: {
    version: 1;
    createdAt: string;
    source: "browser";
  };
  entries: WrongAnswerEntry[];
  settings: AppSettings;
  browserImages: Record<string, string>;
}

export interface RestoreBackupResult {
  restored: true;
  warnings: string[];
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
  const payload: BackupPayload = {
    meta: { version: 1, createdAt: new Date().toISOString(), source: "browser" },
    entries,
    settings,
    browserImages: Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith("img_")).map((key) => [key, localStorage.getItem(key) ?? ""])),
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
  return JSON.parse(await source.text()) as BackupPayload;
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
