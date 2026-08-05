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
    getCurrentWindow.mockReturnValue({
      close,
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
    };
    renderHook(() => useWindowCloseGuard(options));
    await act(async () => { await closeRequested?.({ preventDefault: vi.fn() }); });
    expect(calls.sort()).toEqual(["entries", "generated", "settings", "workspace"]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the window open and exposes retry when a flush fails", async () => {
    let closeRequested: ((event: { preventDefault(): void }) => Promise<void>) | undefined;
    getCurrentWindow.mockReturnValue({
      close: vi.fn(),
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
    };
    const { result } = renderHook(() => useWindowCloseGuard(options));
    await act(async () => { await closeRequested?.({ preventDefault: vi.fn() }); });
    expect(result.current.closeError).toContain("disk full");
    expect(result.current.saving).toBe(false);
  });
});
