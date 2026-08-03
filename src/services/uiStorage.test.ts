import { describe, expect, it, vi } from "vitest";
import { writeUiStorageJson, writeUiStorageValue } from "./uiStorage";

describe("ui storage helpers", () => {
  it("keeps the session alive when a UI preference exceeds storage quota", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const onError = vi.fn();
    expect(writeUiStorageValue("ui-key", "value", onError)).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it("uses the JSON storage contract for UI preferences", () => {
    expect(writeUiStorageJson("ui-json", { value: true })).toBe(true);
    expect(JSON.parse(localStorage.getItem("ui-json") ?? "null")).toEqual({ value: true });
  });
});
