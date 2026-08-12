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

  it("stops close when the active exam cannot be flushed", async () => {
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
    })).rejects.toThrow("시험 진행 상태를 저장하지 못했습니다.");
    expect(flushGeneratedExams).not.toHaveBeenCalled();
    expect(flushSettings).not.toHaveBeenCalled();
    expect(flushLibraryFolders).not.toHaveBeenCalled();
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
