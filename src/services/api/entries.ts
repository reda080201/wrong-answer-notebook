import { invoke, isTauri } from "@tauri-apps/api/core";
import type { WrongAnswerEntry } from "../../types";
import { normalizeEntry } from "../../utils/entry";
import { readStorageJson, writeStorageJson } from "../storageJson";
import {
  ENTRIES_SCHEMA_VERSION,
  ENTRIES_STORAGE_KEY,
  errorMessage,
  isUnknownStorageValue,
  parseStoredEntries,
  type StoredEntriesDocument,
} from "./shared";
import { reconcileBrowserExamSubmissionJournal } from "./examSubmission";

export async function loadEntries(): Promise<WrongAnswerEntry[]> {
  try {
    let data: WrongAnswerEntry[];
    if (isTauri()) {
      data = await invoke<WrongAnswerEntry[]>("load_entries");
    } else {
      reconcileBrowserExamSubmissionJournal();
      const stored = readStorageJson(localStorage, ENTRIES_STORAGE_KEY, isUnknownStorageValue);
      data = stored === null ? [] : parseStoredEntries(stored);
    }
    return data.map(normalizeEntry);
  } catch (error) {
    throw new Error(errorMessage(error, "저장된 노트를 불러오지 못했습니다."), {
      cause: error,
    });
  }
}

export async function saveEntries(entries: WrongAnswerEntry[]): Promise<void> {
  try {
    if (isTauri()) {
      await invoke("save_entries", { entries });
      return;
    }
    const document: StoredEntriesDocument = {
      schemaVersion: ENTRIES_SCHEMA_VERSION,
      entries,
    };
    writeStorageJson(localStorage, ENTRIES_STORAGE_KEY, document);
  } catch (error) {
    throw new Error(errorMessage(error, "노트를 저장하지 못했습니다."), {
      cause: error,
    });
  }
}
