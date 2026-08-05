import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api", () => ({
  getImageUrl: vi.fn(async () => ""),
}));

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: vi.fn(), unmount: vi.fn() }),
}));

import { printExamDocument } from "./printExamDocument";

describe("printExamDocument window.open", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens without noopener features so Chromium returns a Window handle", async () => {
    const popup = {
      opener: {} as Window | null,
      closed: false,
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
        createElement: vi.fn(() => ({ textContent: "", rel: "", href: "" })),
        head: { appendChild: vi.fn() },
        getElementById: vi.fn(() => document.createElement("div")),
        querySelectorAll: vi.fn(() => []),
        images: [],
        title: "",
      },
      focus: vi.fn(),
      print: vi.fn(),
    };
    const open = vi.fn((_url?: string, _target?: string, features?: string) => {
      if (features?.includes("noopener")) return null;
      return popup as unknown as Window;
    });
    window.open = open as typeof window.open;

    await expect(
      printExamDocument({
        title: "t",
        filenameBase: "t",
        scopeLabel: "all",
        questions: [],
        preferences: { paperSize: "a4", layout: "single", preset: "default" } as never,
        includeAnswerSheet: false,
        extraScratchPages: 0,
        sourcePageImages: [],
      } as never),
    ).resolves.toEqual({ failedImages: [], printed: true });

    expect(open).toHaveBeenCalled();
    const features = String(open.mock.calls[0]?.[2] ?? "");
    expect(features).not.toContain("noopener");
    expect(popup.opener).toBeNull();
    expect(popup.print).toHaveBeenCalled();
  });
});
