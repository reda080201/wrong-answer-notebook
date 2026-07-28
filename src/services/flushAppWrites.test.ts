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
    });
    expect(order.sort()).toEqual(["entries", "generated", "settings", "workspace"]);
  });

  it("stops close when the active exam cannot be flushed", async () => {
    const flushGeneratedExams = vi.fn();
    const flushSettings = vi.fn();
    await expect(flushPendingAppWrites({
      activeExam: { id: "session-1" } as never,
      flushExamSession: async () => false,
      flushEntries: vi.fn(),
      flushGeneratedExams,
      flushSettings,
      flushImportWorkspaceDraft: vi.fn(),
    })).rejects.toThrow("시험 진행 상태를 저장하지 못했습니다.");
    expect(flushGeneratedExams).not.toHaveBeenCalled();
    expect(flushSettings).not.toHaveBeenCalled();
  });
});
