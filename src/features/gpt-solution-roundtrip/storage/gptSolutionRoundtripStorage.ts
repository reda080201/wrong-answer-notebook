import { readStorageJson, writeStorageJson } from "../../../services/storageJson";
import {
  isGptSolutionRoundtripDraftArray,
  type GptSolutionRoundtripDraft,
} from "../model";

export const GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY = "wrong-answer-gpt-solution-roundtrip-drafts";

export function loadGptSolutionRoundtripDraftsFromStorage(
  storage: Storage = localStorage,
): GptSolutionRoundtripDraft[] {
  return readStorageJson(
    storage,
    GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY,
    isGptSolutionRoundtripDraftArray,
  ) ?? [];
}

export function saveGptSolutionRoundtripDraftsToStorage(
  drafts: GptSolutionRoundtripDraft[],
  storage: Storage = localStorage,
): void {
  writeStorageJson(storage, GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY, drafts);
}

export function upsertGptSolutionRoundtripDraft(
  drafts: GptSolutionRoundtripDraft[],
  draft: GptSolutionRoundtripDraft,
): GptSolutionRoundtripDraft[] {
  return [...drafts.filter((item) => item.id !== draft.id), draft];
}

export function removeGptSolutionRoundtripDraft(
  drafts: GptSolutionRoundtripDraft[],
  draftId: string,
): GptSolutionRoundtripDraft[] {
  return drafts.filter((draft) => draft.id !== draftId);
}
