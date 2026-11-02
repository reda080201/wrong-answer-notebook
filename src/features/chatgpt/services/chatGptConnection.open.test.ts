import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHATGPT_URL, openChatGpt } from "./chatGptConnection";
import { openExternalUrl } from "../../../services/externalLinks";
import ExternalLinkAction from "../../../shared/ui/ExternalLinkAction";

const { isTauri, openUrl } = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

describe("openChatGpt window.open", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    isTauri.mockReset();
    isTauri.mockReturnValue(false);
    openUrl.mockReset();
  });

  it("opens without noopener features so Chromium returns a Window handle", async () => {
    const opened = { opener: {} as Window | null, closed: false };
    const open = vi.spyOn(window, "open").mockImplementation((_url, _target, features) => {
      if (features?.includes("noopener")) return null;
      return opened as unknown as Window;
    });

    await expect(openChatGpt()).resolves.toBeUndefined();
    expect(open).toHaveBeenCalledWith(CHATGPT_URL, "_blank");
    expect(open.mock.calls[0]?.[2]).toBeUndefined();
    expect(opened.opener).toBeNull();
  });

  it("reports when the browser blocks the popup", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    await expect(openChatGpt()).rejects.toThrow("창을 열지 못했습니다");
    expect(open).toHaveBeenCalledWith(CHATGPT_URL, "_blank");
  });

  it("uses only the native opener on Tauri", async () => {
    isTauri.mockReturnValue(true);
    const browserOpen = vi.spyOn(window, "open");

    await expect(openChatGpt()).resolves.toBeUndefined();

    expect(openUrl).toHaveBeenCalledOnce();
    expect(openUrl).toHaveBeenCalledWith(CHATGPT_URL);
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it("propagates native opener failures", async () => {
    isTauri.mockReturnValue(true);
    const failure = new Error("native opener failed");
    openUrl.mockRejectedValue(failure);

    await expect(openChatGpt()).rejects.toBe(failure);
  });

  it("rejects destinations outside the external URL allowlist", async () => {
    const browserOpen = vi.spyOn(window, "open");

    await expect(openExternalUrl("https://example.com/")).rejects.toThrow("허용되지 않은 외부 주소입니다");
    expect(browserOpen).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });
});

describe("ExternalLinkAction", () => {
  it("copies the address after an open failure without reopening it", async () => {
    const onOpen = vi.fn().mockRejectedValue(new Error("팝업이 차단되었습니다"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    try {
      render(createElement(ExternalLinkAction, { url: CHATGPT_URL, label: "ChatGPT 열기", onOpen }));
      fireEvent.click(screen.getByRole("button", { name: "ChatGPT 열기" }));
      await screen.findByText("팝업이 차단되었습니다");
      fireEvent.click(screen.getByRole("button", { name: "주소 복사" }));
      await screen.findByRole("status");

      expect(writeText).toHaveBeenCalledOnce();
      expect(writeText).toHaveBeenCalledWith(CHATGPT_URL);
      expect(onOpen).toHaveBeenCalledOnce();
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});
