import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  builtInPromptTemplates,
  generateImportWithAi,
  getAiProviderStatus,
  MAX_IMPORT_IMAGE_BYTES,
  saveImageFiles,
} from "./api";
import { IMPORT_LIMITS } from "./features/import/services/importLimits";

const mockedInvoke = vi.mocked(invoke);
const mockedIsTauri = vi.mocked(isTauri);

describe("builtInPromptTemplates", () => {
  it("keeps the sheet JSON prompt strict about raw JSON, printed content, and excluded handwriting", () => {
    const prompt = builtInPromptTemplates.find((template) => template.id === "builtin-sheet-answer-json");

    expect(prompt?.content).toContain("도표/그래프/표");
    expect(prompt?.content).toContain("순수 JSON 객체 1개");
    expect(prompt?.content).toContain("학생 풀이 흔적은 question, memo, importantNotes, answerKey 어디에도 넣지 말고 rejectedNotes에만 기록");
    expect(prompt?.content).toContain("expectedQuestionNumbers");
    expect(prompt?.content).toContain("needsReview");
    expect(prompt?.content).toContain("모든 문항에 같은 difficulty를 반복해서 채우지 마");
    expect(prompt?.content).toContain("한 문항당 최대 1개");
    expect(prompt?.content).toContain("전체 learningBlocks diagram은 최대 3개");
    expect(prompt?.content).not.toContain('"tags"');
    expect(prompt?.content).not.toContain('"difficulty":');
  });

  it("adds a PNG package prompt without base64 image output", () => {
    const prompt = builtInPromptTemplates.find((template) => template.id === "builtin-sheet-png-package");

    expect(prompt?.content).toContain("import.json");
    expect(prompt?.content).toContain("figures");
    expect(prompt?.content).toContain("graph_1.png");
    expect(prompt?.content).toContain("base64 이미지");
    expect(prompt?.content).not.toContain('"tags"');
  });
});

describe("image file security limits", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockedIsTauri.mockReturnValue(false);
    localStorage.clear();
  });

  it("exposes the shared 25MB import image cap", () => {
    expect(MAX_IMPORT_IMAGE_BYTES).toBe(IMPORT_LIMITS.MAX_IMAGE_BYTES);
    expect(MAX_IMPORT_IMAGE_BYTES).toBe(25 * 1024 * 1024);
  });

  it("rejects oversized browser image files", async () => {
    const largeImage = new File([new Uint8Array(MAX_IMPORT_IMAGE_BYTES + 1)], "large.png", {
      type: "image/png",
    });

    await expect(saveImageFiles([largeImage])).rejects.toThrow("25MB 이하");
  });

  it("stores browser image files in localStorage", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const file = new File([bytes], "tiny.png", { type: "image/png" });

    const names = await saveImageFiles([file]);

    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^img_.*_tiny\.png$/);
    expect(localStorage.getItem(names[0])).toMatch(/^data:image\/png;base64,/);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("invokes save_image_bytes with arrayBuffer bytes in Tauri mode", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue("stored-graph.png");
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = new File([bytes], "graph.png", { type: "image/png" });

    const names = await saveImageFiles([file]);

    expect(names).toEqual(["stored-graph.png"]);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith("save_import_image_bytes", {
      filename: "graph.png",
      mime: "image/png",
      bytes: expect.any(Uint8Array),
    });
    const payload = mockedInvoke.mock.calls[0]?.[1] as { bytes: Uint8Array };
    expect(Array.from(payload.bytes)).toEqual(Array.from(bytes));
    expect(localStorage.length).toBe(0);
  });

  it("rejects oversized image files in Tauri mode", async () => {
    mockedIsTauri.mockReturnValue(true);
    const largeImage = new File([new Uint8Array(MAX_IMPORT_IMAGE_BYTES + 1)], "large.png", {
      type: "image/png",
    });

    await expect(saveImageFiles([largeImage])).rejects.toThrow("25MB 이하");
    expect(mockedInvoke).not.toHaveBeenCalled();
  });
});

describe("browser ai provider fallback", () => {
  it("keeps browser mode manual-only and refuses frontend AI calls", async () => {
    const status = await getAiProviderStatus();

    expect(status).toEqual(expect.objectContaining({
      type: "manual",
      enabled: false,
      available: false,
    }));
    await expect(generateImportWithAi("prompt", "", [])).rejects.toThrow("데스크톱 앱");
  });
});
