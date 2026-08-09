import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GptSolutionRoundtripDraft } from "../features/gpt-solution-roundtrip/model";

const { loadGptSolutionRoundtripDrafts, saveGptSolutionRoundtripDrafts } = vi.hoisted(() => ({
  loadGptSolutionRoundtripDrafts: vi.fn(),
  saveGptSolutionRoundtripDrafts: vi.fn(),
}));

vi.mock("../api", () => ({
  errorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback,
  loadGptSolutionRoundtripDrafts,
  saveGptSolutionRoundtripDrafts,
}));

import { useGptSolutionRoundtripDrafts } from "./useGptSolutionRoundtripDrafts";

const draft: GptSolutionRoundtripDraft = {
  id: "draft-1",
  entryId: "entry-1",
  entryUpdatedAt: "2026-01-01T00:00:00.000Z",
  purpose: "full_solution",
  requestedQuestionNumbers: ["1"],
  questionSnapshot: {} as GptSolutionRoundtripDraft["questionSnapshot"],
  status: "shared",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("useGptSolutionRoundtripDrafts", () => {
  beforeEach(() => {
    loadGptSolutionRoundtripDrafts.mockReset();
    saveGptSolutionRoundtripDrafts.mockReset();
  });

  it("does not overwrite drafts when the initial load fails", async () => {
    loadGptSolutionRoundtripDrafts.mockRejectedValueOnce(new Error("permission denied"));
    const { result } = renderHook(() => useGptSolutionRoundtripDrafts());

    await waitFor(() => expect(result.current.loadError).toContain("permission denied"));
    await act(async () => {
      await expect(result.current.upsertDraft(draft)).rejects.toThrow("permission denied");
    });
    expect(saveGptSolutionRoundtripDrafts).not.toHaveBeenCalled();
  });

  it("flushes a queued draft save before close or maintenance work", async () => {
    loadGptSolutionRoundtripDrafts.mockResolvedValueOnce([]);
    let resolveSave!: () => void;
    saveGptSolutionRoundtripDrafts.mockReturnValueOnce(new Promise<void>((resolve) => { resolveSave = resolve; }));
    const { result } = renderHook(() => useGptSolutionRoundtripDrafts());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let save!: Promise<void>;
    await act(async () => { save = result.current.upsertDraft(draft); });
    const flushed = result.current.flush();
    resolveSave();
    await act(async () => { await Promise.all([save, flushed]); });
    expect(saveGptSolutionRoundtripDrafts).toHaveBeenCalledWith([draft]);
  });
});
