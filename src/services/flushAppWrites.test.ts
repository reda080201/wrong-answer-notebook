import { describe, expect, it, vi } from "vitest";
import { flushPendingAppWrites } from "./flushAppWrites";

describe("flushPendingAppWrites", () => {
  it("flushes settings and generated exams even without an active exam", async () => {
    const order: string[] = [];
    await flushPendingAppWrites({
      activeExam: null,
      flushExamSession: vi.fn(),
      flushEntries: async () => { order.push("entries"); },
      flushGeneratedExams: async () => { order.push("generated"); },
      flushSettings: async () => { order.push("settings"); },
      flushImportWorkspaceDraft: async () => { order.push("workspace"); },
      flushLibraryFolders: async () => { order.push("library"); },
      flushGptSolutionDrafts: async () => { order.push("gpt-drafts"); },
    });
    expect(order.sort()).toEqual(["entries", "generated", "gpt-drafts", "library", "settings", "workspace"]);
  });

  it("flushes every store before reporting an active-exam failure", async () => {
    const flushGeneratedExams = vi.fn();
    const flushSettings = vi.fn();
    const flushLibraryFolders = vi.fn();
    await expect(flushPendingAppWrites({
      activeExam: { id: "session-1" } as never,
      flushExamSession: async () => false,
      flushEntries: vi.fn(),
      flushGeneratedExams,
      flushSettings,
      flushImportWorkspaceDraft: vi.fn(),
      flushLibraryFolders,
    })).rejects.toThrow("시험 진행 상태");
    expect(flushGeneratedExams).toHaveBeenCalledOnce();
    expect(flushSettings).toHaveBeenCalledOnce();
    expect(flushLibraryFolders).toHaveBeenCalledOnce();
  });

  it("reports failures only after every persistence queue has been flushed", async () => {
    const flushEntries = vi.fn().mockRejectedValue(new Error("entries failed"));
    const flushSettings = vi.fn().mockResolvedValue(undefined);
    const flushLibraryFolders = vi.fn().mockResolvedValue(undefined);
    await expect(flushPendingAppWrites({
      activeExam: null,
      flushExamSession: vi.fn(),
      flushEntries,
      flushGeneratedExams: vi.fn().mockResolvedValue(undefined),
      flushSettings,
      flushImportWorkspaceDraft: vi.fn().mockResolvedValue(undefined),
      flushLibraryFolders,
    })).rejects.toThrow("오답노트");
    expect(flushSettings).toHaveBeenCalledOnce();
    expect(flushLibraryFolders).toHaveBeenCalledOnce();
  });

  it("fails with a bounded timeout when a persistence queue never settles", async () => {
    await expect(flushPendingAppWrites({
      activeExam: null,
      flushExamSession: vi.fn(),
      flushEntries: () => new Promise<void>(() => {}),
      flushGeneratedExams: vi.fn(),
      flushSettings: vi.fn(),
      flushImportWorkspaceDraft: vi.fn(),
      flushLibraryFolders: vi.fn(),
      timeoutMs: 5,
    })).rejects.toThrow("저장 시간이 초과되었습니다");
  });
});
