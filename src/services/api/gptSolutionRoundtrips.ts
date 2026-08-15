import type { GptSolutionRoundtripDraft } from "../../features/gpt-solution-roundtrip/model";
import {
  GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY,
} from "../../features/gpt-solution-roundtrip/storage/gptSolutionRoundtripStorage";
import { errorMessage } from "./shared";
import { getStorageBackend } from "../storageBackend";

export { GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY };

export async function loadGptSolutionRoundtripDrafts(): Promise<GptSolutionRoundtripDraft[]> {
  try {
    return await getStorageBackend().loadGptSolutionDrafts();
  } catch (error) {
    throw new Error(errorMessage(error, "GPT 해설 초안을 불러오지 못했습니다."), { cause: error });
  }
}

export async function saveGptSolutionRoundtripDrafts(
  drafts: GptSolutionRoundtripDraft[],
): Promise<void> {
  try {
    await getStorageBackend().saveGptSolutionDrafts(drafts);
  } catch (error) {
    throw new Error(errorMessage(error, "GPT 해설 초안을 저장하지 못했습니다."), { cause: error });
  }
}
