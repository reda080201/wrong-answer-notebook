import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
}));

import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  loadGptSolutionRoundtripDrafts,
  saveGptSolutionRoundtripDrafts,
} from "../../api";
import type { GptSolutionRoundtripDraft } from "../../types";
import {
  GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY,
  removeGptSolutionRoundtripDraft,
  loadGptSolutionRoundtripDraftsFromStorage,
  saveGptSolutionRoundtripDraftsToStorage,
  upsertGptSolutionRoundtripDraft,
} from "../../features/gpt-solution-roundtrip/storage/gptSolutionRoundtripStorage";

const mockedInvoke = vi.mocked(invoke);
const mockedIsTauri = vi.mocked(isTauri);

function draft(id = "draft-1"): GptSolutionRoundtripDraft {
  return {
    id,
    entryId: "entry-1",
    entryUpdatedAt: "2026-08-05T00:00:00.000Z",
    purpose: "full_solution",
    requestedQuestionNumbers: ["3", "7", "12"],
    questionSnapshot: {
      title: "수학 문제지",
      subject: "수학",
      scope: "selected",
      questionNumbers: ["3", "7", "12"],
      submitted: false,
      answerProtection: "active",
      questions: [{ questionNumber: "3", choices: [], images: [] }],
    },
    status: "shared",
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}

function memoryStorage(initial: Record<string, string> = {}): Storage & { setItem: ReturnType<typeof vi.fn> } {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  } as Storage & { setItem: ReturnType<typeof vi.fn> };
}

describe("gpt solution roundtrip persistence", () => {
  beforeEach(() => {
    mockedIsTauri.mockReturnValue(false);
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockedIsTauri.mockReturnValue(false);
    localStorage.clear();
  });

  it("uses storageJson browser fallback and accepts an absent draft store", () => {
    const storage = memoryStorage();
    expect(loadGptSolutionRoundtripDraftsFromStorage(storage)).toEqual([]);

    const drafts = [draft()];
    saveGptSolutionRoundtripDraftsToStorage(drafts, storage);

    expect(storage.setItem).toHaveBeenCalledWith(
      GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY,
      JSON.stringify(drafts),
    );
    expect(JSON.parse(storage.getItem(GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY) ?? "[]"))
      .toEqual(drafts);
    expect(loadGptSolutionRoundtripDraftsFromStorage(storage)).toEqual(drafts);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("rejects malformed browser draft data instead of silently using it", () => {
    const storage = memoryStorage({ [GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY]: JSON.stringify([{
      id: "missing-required-fields",
    }]) });

    expect(() => loadGptSolutionRoundtripDraftsFromStorage(storage)).toThrow("저장된 데이터 형식이 올바르지 않습니다.");
  });

  it("uses dedicated Tauri commands for load and save", async () => {
    mockedIsTauri.mockReturnValue(true);
    const drafts = [draft()];
    mockedInvoke.mockResolvedValueOnce(drafts).mockResolvedValueOnce(undefined);

    await expect(loadGptSolutionRoundtripDrafts()).resolves.toEqual(drafts);
    await saveGptSolutionRoundtripDrafts(drafts);

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "load_gpt_solution_roundtrip_drafts");
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "save_gpt_solution_roundtrip_drafts", { drafts });
  });

  it("upserts and removes drafts without mutating the input list", () => {
    const original = [draft("draft-1")];
    const replacement = { ...draft("draft-1"), status: "reviewing" as const };

    const updated = upsertGptSolutionRoundtripDraft(original, replacement);

    expect(original[0]?.status).toBe("shared");
    expect(updated).toEqual([replacement]);
    expect(removeGptSolutionRoundtripDraft(updated, "draft-1")).toEqual([]);
  });
});
