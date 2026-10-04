import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportWorkspace } from "../model/importWorkspace";
import { useImportWorkspaceAutosave } from "./useImportWorkspaceAutosave";
import { clearImportWorkspaceDraft, saveImportWorkspaceDraft } from "./useImportWorkspaceAutosave";
import { getStorageBackend, IMPORT_WORKSPACE_DRAFT_STORAGE_KEY } from "../../../services/storageBackend";

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

  it("serializes a pending autosave before draft discard", async () => {
    let finishWrite!: () => void;
    vi.spyOn(getStorageBackend(), "saveImportWorkspaceDraft").mockImplementation((draft) => new Promise<void>((resolve) => {
      finishWrite = () => { localStorage.setItem(IMPORT_WORKSPACE_DRAFT_STORAGE_KEY, JSON.stringify(draft)); resolve(); };
    }));
    const pendingSave = saveImportWorkspaceDraft({ ...workspace, id: "late-save" });
    await Promise.resolve();
    const pendingDiscard = clearImportWorkspaceDraft();
    await Promise.resolve();
    finishWrite();
    await Promise.all([pendingSave, pendingDiscard]);

    expect(localStorage.getItem(IMPORT_WORKSPACE_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
