import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_SIDEBAR_COLLAPSED_KEY,
  ENTRY_PANE_COLLAPSED_KEY,
  ENTRY_PANE_WIDTH_KEY,
  useUiShellPreferences,
} from "./useUiShellPreferences";

describe("useUiShellPreferences", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("starts narrow screens collapsed without overwriting the wide-screen choice", () => {
    const listeners = new Set<() => void>();
    const media = { matches: false, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    localStorage.setItem(APP_SIDEBAR_COLLAPSED_KEY, "false");
    const { result } = renderHook(() => useUiShellPreferences());
    expect(result.current.appSidebarCollapsed).toBe(false);
    act(() => { media.matches = true; listeners.forEach(fn => fn()); });
    expect(result.current.appSidebarCollapsed).toBe(true);
    act(() => result.current.setAppSidebarCollapsed(false));
    expect(result.current.appSidebarOverlay).toBe(true);
    act(() => result.current.setAppSidebarCollapsed(true));
    expect(localStorage.getItem(APP_SIDEBAR_COLLAPSED_KEY)).toBe("false");
    act(() => { media.matches = false; listeners.forEach(fn => fn()); });
    expect(result.current.appSidebarCollapsed).toBe(false);
    expect(result.current.appSidebarOverlay).toBe(false);
  });

  it("persists independent pane states and clamps the entry width", () => {
    const { result, unmount } = renderHook(() => useUiShellPreferences());
    act(() => {
      result.current.setAppSidebarCollapsed(true);
      result.current.setEntryPaneCollapsed(true);
      result.current.setEntryPaneWidth(999);
    });
    expect(localStorage.getItem(APP_SIDEBAR_COLLAPSED_KEY)).toBe("true");
    expect(localStorage.getItem(ENTRY_PANE_COLLAPSED_KEY)).toBe("true");
    expect(localStorage.getItem(ENTRY_PANE_WIDTH_KEY)).toBe("460");
    unmount();

    const restored = renderHook(() => useUiShellPreferences());
    expect(restored.result.current).toMatchObject({
      appSidebarCollapsed: true,
      entryPaneCollapsed: true,
      entryPaneWidth: 460,
    });
  });
});
