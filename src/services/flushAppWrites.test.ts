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
    const flushEntries = vi.fn();
    const flushGeneratedExams = vi.fn();
    const flushSettings = vi.fn();
    const flushLibraryFolders = vi.fn();
    await expect(flushPendingAppWrites({
      activeExam: { id: "session-1" } as never,
      flushExamSession: async () => false,
      flushEntries,
      flushGeneratedExams,
      flushSettings,
      flushImportWorkspaceDraft: vi.fn(),
      flushLibraryFolders,
    })).rejects.toThrow("시험 진행 상태를 저장하지 못했습니다.");
    expect(flushEntries).toHaveBeenCalledOnce();
    expect(flushGeneratedExams).toHaveBeenCalledOnce();
    expect(flushSettings).toHaveBeenCalledOnce();
    expect(flushLibraryFolders).toHaveBeenCalledOnce();
  });

  it("preserves the store name and Error reason after every queue is flushed", async () => {
    const flushEntries = vi.fn().mockRejectedValue(new Error("disk full"));
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
    })).rejects.toThrow(/오답노트.*disk full/);
    expect(flushSettings).toHaveBeenCalledOnce();
    expect(flushLibraryFolders).toHaveBeenCalledOnce();
  });

  it("reports every store and reason when multiple persistence paths fail", async () => {
    let error: Error | undefined;
    await flushPendingAppWrites({
      activeExam: null,
      flushExamSession: vi.fn(),
      flushEntries: vi.fn().mockRejectedValue(new Error("disk full")),
      flushGeneratedExams: vi.fn().mockResolvedValue(undefined),
      flushSettings: vi.fn().mockRejectedValue(new Error("permission denied")),
      flushImportWorkspaceDraft: vi.fn().mockResolvedValue(undefined),
      flushLibraryFolders: vi.fn().mockResolvedValue(undefined),
    }).catch((reason: unknown) => { error = reason as Error; });

    expect(error?.message).toContain("오답노트: disk full");
    expect(error?.message).toContain("설정: permission denied");
  });

  it("preserves string rejections", async () => {
    await expect(flushPendingAppWrites({
      activeExam: null,
      flushExamSession: vi.fn(),
      flushEntries: vi.fn().mockRejectedValue("quota exceeded"),
      flushGeneratedExams: vi.fn().mockResolvedValue(undefined),
      flushSettings: vi.fn().mockResolvedValue(undefined),
      flushImportWorkspaceDraft: vi.fn().mockResolvedValue(undefined),
      flushLibraryFolders: vi.fn().mockResolvedValue(undefined),
    })).rejects.toThrow(/오답노트.*quota exceeded/);
  });

  it.each([null, { internal: "secret" }, ""])(
    "uses a safe fallback for unsupported rejection values",
    async (reason) => {
      let error: Error | undefined;
      await flushPendingAppWrites({
        activeExam: null,
        flushExamSession: vi.fn(),
        flushEntries: vi.fn().mockRejectedValue(reason),
        flushGeneratedExams: vi.fn().mockResolvedValue(undefined),
        flushSettings: vi.fn().mockResolvedValue(undefined),
        flushImportWorkspaceDraft: vi.fn().mockResolvedValue(undefined),
        flushLibraryFolders: vi.fn().mockResolvedValue(undefined),
      }).catch((failure: unknown) => { error = failure as Error; });

      expect(error?.message).toContain("알 수 없는 저장 오류");
      expect(error?.message).not.toContain("internal");
      expect(error?.message).not.toContain("secret");
    },
  );

  it("starts every persistence operation even when one callback throws synchronously", async () => {
    const flushSettings = vi.fn().mockResolvedValue(undefined);
    const flushLibraryFolders = vi.fn().mockResolvedValue(undefined);
    await expect(flushPendingAppWrites({
      activeExam: null,
      flushExamSession: vi.fn(),
      flushEntries: vi.fn(() => { throw new Error("sync failure"); }),
      flushGeneratedExams: vi.fn().mockResolvedValue(undefined),
      flushSettings,
      flushImportWorkspaceDraft: vi.fn().mockResolvedValue(undefined),
      flushLibraryFolders,
    })).rejects.toThrow("sync failure");

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
