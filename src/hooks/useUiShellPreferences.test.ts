import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  APP_SIDEBAR_COLLAPSED_KEY,
  ENTRY_PANE_COLLAPSED_KEY,
  ENTRY_PANE_WIDTH_KEY,
  useUiShellPreferences,
} from "./useUiShellPreferences";

describe("useUiShellPreferences", () => {
  beforeEach(() => localStorage.clear());

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
