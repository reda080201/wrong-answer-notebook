import { invoke, isTauri } from "@tauri-apps/api/core";
import type { GptSolutionRoundtripDraft } from "../../features/gpt-solution-roundtrip/model";
import {
  GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY,
  loadGptSolutionRoundtripDraftsFromStorage,
  saveGptSolutionRoundtripDraftsToStorage,
} from "../../features/gpt-solution-roundtrip/storage/gptSolutionRoundtripStorage";
import { errorMessage } from "./shared";

export { GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY };

export async function loadGptSolutionRoundtripDrafts(): Promise<GptSolutionRoundtripDraft[]> {
  try {
    if (isTauri()) {
      return await invoke<GptSolutionRoundtripDraft[]>("load_gpt_solution_roundtrip_drafts");
    }
    return loadGptSolutionRoundtripDraftsFromStorage();
  } catch (error) {
    throw new Error(errorMessage(error, "GPT 해설 초안을 불러오지 못했습니다."), { cause: error });
  }
}

export async function saveGptSolutionRoundtripDrafts(
  drafts: GptSolutionRoundtripDraft[],
): Promise<void> {
  try {
    if (isTauri()) {
      await invoke("save_gpt_solution_roundtrip_drafts", { drafts });
      return;
    }
    saveGptSolutionRoundtripDraftsToStorage(drafts);
  } catch (error) {
    throw new Error(errorMessage(error, "GPT 해설 초안을 저장하지 못했습니다."), { cause: error });
  }
}
