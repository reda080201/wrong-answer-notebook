import type { WrongAnswerEntry } from "../../types";
import { normalizeEntry } from "../../utils/entry";
import { getStorageBackend } from "../storageBackend";
import { errorMessage } from "./shared";
import { reconcileBrowserExamSubmissionJournal } from "./examSubmission";

export async function loadEntries(): Promise<WrongAnswerEntry[]> {
  try {
    const backend = getStorageBackend();
    if (backend.kind === "isolated-browser") {
      reconcileBrowserExamSubmissionJournal();
    }
    const data = await backend.loadEntries();
    return data.map(normalizeEntry);
  } catch (error) {
    throw new Error(errorMessage(error, "저장된 노트를 불러오지 못했습니다."), {
      cause: error,
    });
  }
}

export async function saveEntries(entries: WrongAnswerEntry[]): Promise<void> {
  try {
    await getStorageBackend().saveEntries(entries);
  } catch (error) {
    throw new Error(errorMessage(error, "노트를 저장하지 못했습니다."), {
      cause: error,
    });
  }
}
