import { afterEach, describe, expect, it, vi } from "vitest";
import { openChatGpt } from "./chatGptConnection";

describe("openChatGpt window.open", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens without noopener features so Chromium returns a Window handle", async () => {
    const opened = { opener: {} as Window | null, closed: false };
    const open = vi.fn((_url?: string, _target?: string, features?: string) => {
      if (features?.includes("noopener")) return null;
      return opened as unknown as Window;
    });
    window.open = open as typeof window.open;

    await expect(openChatGpt()).resolves.toBeUndefined();
    expect(open).toHaveBeenCalledWith(expect.any(String), "_blank");
    expect(open.mock.calls[0]?.[2]).toBeUndefined();
    expect(opened.opener).toBeNull();
  });
});
