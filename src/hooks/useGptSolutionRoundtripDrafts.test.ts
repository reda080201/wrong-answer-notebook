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

const anotherDraft: GptSolutionRoundtripDraft = {
  ...draft,
  id: "draft-2",
  requestedQuestionNumbers: ["2"],
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

  it("keeps every successful upsert in the canonical queued draft state", async () => {
    loadGptSolutionRoundtripDrafts.mockResolvedValueOnce([]);
    saveGptSolutionRoundtripDrafts.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGptSolutionRoundtripDrafts());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.upsertDraft(draft);
      second = result.current.upsertDraft(anotherDraft);
      await Promise.all([first, second]);
    });

    expect(saveGptSolutionRoundtripDrafts).toHaveBeenNthCalledWith(1, [draft]);
    expect(saveGptSolutionRoundtripDrafts).toHaveBeenNthCalledWith(2, [draft, anotherDraft]);
  });

  it("applies update then remove in queued order", async () => {
    loadGptSolutionRoundtripDrafts.mockResolvedValueOnce([draft]);
    saveGptSolutionRoundtripDrafts.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGptSolutionRoundtripDrafts());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let update!: Promise<void>;
    let remove!: Promise<void>;
    await act(async () => {
      update = result.current.updateDraft(draft.id, (current) => ({ ...current, status: "reviewing" }));
      remove = result.current.removeDraft(draft.id);
      await Promise.all([update, remove]);
    });

    expect(saveGptSolutionRoundtripDrafts).toHaveBeenNthCalledWith(1, [{ ...draft, status: "reviewing" }]);
    expect(saveGptSolutionRoundtripDrafts).toHaveBeenNthCalledWith(2, []);
    expect(result.current.getDraft(draft.id)).toBeUndefined();
  });

  it("allows an accepted draft save to flush while maintenance blocks a later request", async () => {
    loadGptSolutionRoundtripDrafts.mockResolvedValueOnce([]);
    let finishSave!: () => void;
    saveGptSolutionRoundtripDrafts.mockReturnValueOnce(new Promise<void>((resolve) => { finishSave = resolve; }));
    const { result } = renderHook(() => useGptSolutionRoundtripDrafts());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const accepted = result.current.upsertDraft(draft);
    result.current.setMaintenanceBlocked(true);
    await expect(result.current.upsertDraft(anotherDraft)).rejects.toThrow("백업 또는 복원이 진행 중");
    finishSave();
    await expect(accepted).resolves.toBeUndefined();
    await expect(result.current.flush()).resolves.toBeUndefined();
  });

  it("drains an accepted save before reloading the draft snapshot", async () => {
    loadGptSolutionRoundtripDrafts
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([anotherDraft]);
    let finishSave!: () => void;
    saveGptSolutionRoundtripDrafts.mockReturnValueOnce(new Promise<void>((resolve) => { finishSave = resolve; }));
    const { result } = renderHook(() => useGptSolutionRoundtripDrafts());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const mutation = result.current.upsertDraft(draft);
    const reload = result.current.reload();
    finishSave();
    await act(async () => { await Promise.all([mutation, reload]); });

    expect(saveGptSolutionRoundtripDrafts).toHaveBeenCalledWith([draft]);
    expect(result.current.getDraft(anotherDraft.id)).toEqual(anotherDraft);
  });
});
