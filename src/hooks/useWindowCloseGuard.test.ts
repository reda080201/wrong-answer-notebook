import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { isTauri, getCurrentWindow } = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  getCurrentWindow: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow }));

import { useWindowCloseGuard } from "./useWindowCloseGuard";

describe("useWindowCloseGuard", () => {
  beforeEach(() => {
    isTauri.mockReturnValue(true);
    getCurrentWindow.mockReset();
  });

  it("waits for every persistence path before closing", async () => {
    let closeRequested: ((event: { preventDefault(): void }) => Promise<void>) | undefined;
    const close = vi.fn(async () => undefined);
    const destroy = vi.fn(async () => undefined);
    getCurrentWindow.mockReturnValue({
      close,
      destroy,
      onCloseRequested: vi.fn(async (handler) => { closeRequested = handler; return vi.fn(); }),
    });
    const calls: string[] = [];
    const options = {
      activeExam: null,
      examSaveTimerRef: { current: null },
      flushExamSession: vi.fn(async () => true),
      flushEntries: vi.fn(async () => { calls.push("entries"); }),
      flushGeneratedExams: vi.fn(async () => { calls.push("generated"); }),
      flushSettings: vi.fn(async () => { calls.push("settings"); }),
      flushImportWorkspaceDraft: vi.fn(async () => { calls.push("workspace"); }),
      flushLibraryFolders: vi.fn(async () => { calls.push("library"); }),
      confirmCloseWithoutSaving: vi.fn(async () => true),
    };
    renderHook(() => useWindowCloseGuard(options));
    await act(async () => { await closeRequested?.({ preventDefault: vi.fn() }); });
    expect(calls.sort()).toEqual(["entries", "generated", "library", "settings", "workspace"]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the window open and exposes retry when a flush fails", async () => {
    let closeRequested: ((event: { preventDefault(): void }) => Promise<void>) | undefined;
    getCurrentWindow.mockReturnValue({
      close: vi.fn(),
      destroy: vi.fn(),
      onCloseRequested: vi.fn(async (handler) => { closeRequested = handler; return vi.fn(); }),
    });
    const options = {
      activeExam: null,
      examSaveTimerRef: { current: null },
      flushExamSession: vi.fn(async () => true),
      flushEntries: vi.fn(async () => { throw new Error("disk full"); }),
      flushGeneratedExams: vi.fn(async () => undefined),
      flushSettings: vi.fn(async () => undefined),
      flushImportWorkspaceDraft: vi.fn(async () => undefined),
      flushLibraryFolders: vi.fn(async () => undefined),
      confirmCloseWithoutSaving: vi.fn(async () => true),
    };
    const { result } = renderHook(() => useWindowCloseGuard(options));
    await act(async () => { await closeRequested?.({ preventDefault: vi.fn() }); });
    expect(result.current.closeError).toContain("disk full");
    expect(result.current.saving).toBe(false);
  });

  it("preserves string errors returned by a Tauri window command", async () => {
    let closeRequested: ((event: { preventDefault(): void }) => Promise<void>) | undefined;
    getCurrentWindow.mockReturnValue({
      close: vi.fn(async () => { throw "window.close not allowed"; }),
      destroy: vi.fn(),
      onCloseRequested: vi.fn(async (handler) => { closeRequested = handler; return vi.fn(); }),
    });
    const { result } = renderHook(() => useWindowCloseGuard({
      activeExam: null,
      examSaveTimerRef: { current: null },
      flushExamSession: vi.fn(async () => true),
      flushEntries: vi.fn(async () => undefined),
      flushGeneratedExams: vi.fn(async () => undefined),
      flushSettings: vi.fn(async () => undefined),
      flushImportWorkspaceDraft: vi.fn(async () => undefined),
      flushLibraryFolders: vi.fn(async () => undefined),
      confirmCloseWithoutSaving: vi.fn(async () => true),
    }));
    await act(async () => { await closeRequested?.({ preventDefault: vi.fn() }); });
    expect(result.current.closeError).toBe("window.close not allowed");
  });

  it("does not destroy the window before discard confirmation", async () => {
    let closeRequested: ((event: { preventDefault(): void }) => Promise<void>) | undefined;
    const destroy = vi.fn(async () => undefined);
    const confirmCloseWithoutSaving = vi.fn(async () => false);
    getCurrentWindow.mockReturnValue({
      close: vi.fn(),
      destroy,
      onCloseRequested: vi.fn(async (handler) => { closeRequested = handler; return vi.fn(); }),
    });
    const { result } = renderHook(() => useWindowCloseGuard({
      activeExam: null,
      examSaveTimerRef: { current: null },
      flushExamSession: vi.fn(async () => true),
      flushEntries: vi.fn(async () => { throw new Error("disk full"); }),
      flushGeneratedExams: vi.fn(async () => undefined),
      flushSettings: vi.fn(async () => undefined),
      flushImportWorkspaceDraft: vi.fn(async () => undefined),
      flushLibraryFolders: vi.fn(async () => undefined),
      confirmCloseWithoutSaving,
    }));
    await act(async () => { await closeRequested?.({ preventDefault: vi.fn() }); });
    await act(async () => { await result.current.closeWithoutSaving(); });
    expect(confirmCloseWithoutSaving).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("destroys the window once after confirmed discard without re-entering the guard", async () => {
    let closeRequested: ((event: { preventDefault(): void }) => Promise<void>) | undefined;
    const destroy = vi.fn(async () => undefined);
    getCurrentWindow.mockReturnValue({
      close: vi.fn(),
      destroy,
      onCloseRequested: vi.fn(async (handler) => { closeRequested = handler; return vi.fn(); }),
    });
    const flushEntries = vi.fn(async () => { throw new Error("disk full"); });
    const { result } = renderHook(() => useWindowCloseGuard({
      activeExam: null,
      examSaveTimerRef: { current: null },
      flushExamSession: vi.fn(async () => true),
      flushEntries,
      flushGeneratedExams: vi.fn(async () => undefined),
      flushSettings: vi.fn(async () => undefined),
      flushImportWorkspaceDraft: vi.fn(async () => undefined),
      flushLibraryFolders: vi.fn(async () => undefined),
      confirmCloseWithoutSaving: vi.fn(async () => true),
    }));
    await act(async () => { await closeRequested?.({ preventDefault: vi.fn() }); });
    await act(async () => { await result.current.closeWithoutSaving(); });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(flushEntries).toHaveBeenCalledTimes(1);
  });
});
