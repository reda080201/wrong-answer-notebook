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
  loadExamSessions,
  loadGeneratedExams,
  MAX_IMPORT_IMAGE_BYTES,
  cleanupOrphanImages,
  clearImageUrlCache,
  getImageUrl,
  IMAGE_URL_CACHE_LIMIT,
  previewOrphanImages,
  saveExamSessions,
  saveGeneratedExams,
  saveImageFiles,
} from "./api";
import { EXAM_SESSIONS_STORAGE_KEY } from "./features/exam/storage/examSessionStorage";
import type { ExamSession } from "./types";
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
    expect(prompt?.content).toContain('"schemaVersion": "wrong-answer-notebook-import-v2"');
    expect(prompt?.content).toContain('"importType": "problem_sheet"');
    expect(prompt?.content).toContain('"entryKind": "problem_sheet"');
    expect(prompt?.content).toContain("figures");
    expect(prompt?.content).toContain("graph_1.png");
    expect(prompt?.content).toContain("base64 이미지");
    expect(prompt?.content).not.toContain('"tags"');
  });

  it("keeps the JSON-only prompt explicit about the problem-sheet entry kind", () => {
    const prompt = builtInPromptTemplates.find((template) => template.id === "builtin-sheet-answer-json");
    expect(prompt?.content).toContain('"entryKind": "problem_sheet"');
  });
});

describe("image file security limits", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockedIsTauri.mockReturnValue(false);
    localStorage.clear();
    clearImageUrlCache();
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
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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

  it("bounds desktop image URL caching and does not cache browser data URLs", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockImplementation(async (_command, args) => `C:/images/${(args as { filename: string }).filename}`);
    for (let index = 0; index <= IMAGE_URL_CACHE_LIMIT; index += 1) {
      await getImageUrl(`image-${index}.png`);
    }
    const afterInitialLoad = mockedInvoke.mock.calls.length;
    await getImageUrl("image-0.png");
    expect(mockedInvoke).toHaveBeenCalledTimes(afterInitialLoad + 1);

    mockedIsTauri.mockReturnValue(false);
    localStorage.setItem("img_browser.png", "data:image/png;base64,value");
    await getImageUrl("img_browser.png");
    await getImageUrl("img_browser.png");
    expect(mockedInvoke).toHaveBeenCalledTimes(afterInitialLoad + 1);
  });

  it("rejects oversized image files in Tauri mode", async () => {
    mockedIsTauri.mockReturnValue(true);
    const largeImage = new File([new Uint8Array(MAX_IMPORT_IMAGE_BYTES + 1)], "large.png", {
      type: "image/png",
    });

    await expect(saveImageFiles([largeImage])).rejects.toThrow("25MB 이하");
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("accepts a supported image with an empty MIME type", async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "empty-type.png", { type: "" });
    await expect(saveImageFiles([file])).resolves.toHaveLength(1);
  });

  it("uses stored entries, including source pages and learning blocks, for browser orphan cleanup", async () => {
    localStorage.setItem("wrong-answer-entries", JSON.stringify({
      schemaVersion: 2,
      entries: [{
        id: "lecture-1",
        subject: "수학",
        title: "특강",
        question: "",
        entryKind: "lecture",
        questionImages: [],
        sourcePageImages: ["img_source.png"],
        learningBlocks: [{ id: "block-1", type: "concept", title: "", content: "", images: ["img_block.png"] }],
        explanationParts: [],
        annotations: [],
        tags: [],
        figures: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        mastered: false,
      }],
    }));
    localStorage.setItem("img_source.png", "data:image/png;base64,source");
    localStorage.setItem("img_block.png", "data:image/png;base64,block");
    localStorage.setItem("img_orphan.png", "data:image/png;base64,orphan");

    await expect(previewOrphanImages()).resolves.toEqual(expect.objectContaining({ filenames: ["img_orphan.png"] }));
    await expect(cleanupOrphanImages()).resolves.toBe(1);
    expect(localStorage.getItem("img_source.png")).toBeTruthy();
    expect(localStorage.getItem("img_block.png")).toBeTruthy();
    expect(localStorage.getItem("img_orphan.png")).toBeNull();
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


describe("exam session persistence", () => {
  const sampleSession = (): ExamSession => ({
    id: "session-1",
    entryId: "entry-1",
    title: "모의고사",
    subject: "수학",
    status: "in_progress",
    questions: [],
    responses: [],
    currentQuestionIndex: 0,
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockedIsTauri.mockReturnValue(false);
    localStorage.clear();
  });

  it("loads and saves exam sessions from localStorage in browser mode", async () => {
    const sessions = [sampleSession()];
    localStorage.setItem(EXAM_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));

    await expect(loadExamSessions()).resolves.toEqual(sessions);

    const updated = [{ ...sampleSession(), currentQuestionIndex: 2 }];
    await saveExamSessions(updated);

    expect(JSON.parse(localStorage.getItem(EXAM_SESSIONS_STORAGE_KEY) ?? "[]")).toEqual(updated);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("uses Tauri invoke for exam session persistence in desktop mode", async () => {
    mockedIsTauri.mockReturnValue(true);
    const sessions = [sampleSession()];
    mockedInvoke.mockResolvedValueOnce(sessions).mockResolvedValueOnce(undefined);

    await expect(loadExamSessions()).resolves.toEqual(sessions);
    await saveExamSessions(sessions);

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "load_exam_sessions");
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "save_exam_sessions", { sessions });
  });

  it("rejects non-array Tauri persistence payloads without invoking save", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    await expect(loadExamSessions()).rejects.toThrow("모의고사 세션 저장 형식이 올바르지 않습니다");
    await expect(loadGeneratedExams()).rejects.toThrow("생성 모의고사 저장 형식이 올바르지 않습니다");
    await expect(saveExamSessions({} as unknown as ExamSession[])).rejects.toThrow("모의고사 세션 저장 형식이 올바르지 않습니다");
    await expect(saveGeneratedExams({} as never)).rejects.toThrow("생성 모의고사 저장 형식이 올바르지 않습니다");
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });
});
