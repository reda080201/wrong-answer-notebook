import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportWorkspace } from "../model/importWorkspace";
import { useImportWorkspaceAutosave } from "./useImportWorkspaceAutosave";

const workspace = {
  id: "workspace-1",
  groups: [],
  unassignedBlocks: [],
} as unknown as ImportWorkspace;

describe("useImportWorkspaceAutosave", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("reports a successful deferred draft save", async () => {
    vi.useFakeTimers();
    const onSaving = vi.fn();
    const onSaved = vi.fn();
    renderHook(() => useImportWorkspaceAutosave(workspace, true, { onSaving, onSaved }));

    await act(async () => { await vi.advanceTimersByTimeAsync(750); });

    expect(onSaving).toHaveBeenCalledOnce();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("reports storage errors instead of silently dropping the draft", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    renderHook(() => useImportWorkspaceAutosave(workspace, true, { onError }));

    await act(async () => { await vi.advanceTimersByTimeAsync(750); });

    expect(onError).toHaveBeenCalledOnce();
  });
});
