import { describe, expect, it } from "vitest";
import { normalizeQuestionNumber, toggleQuestionImportant } from "./questionMeta";

describe("questionMeta utilities", () => {
  it("normalizes display, source, and answer key question numbers", () => {
    expect(normalizeQuestionNumber("01")).toBe("1");
    expect(normalizeQuestionNumber("1")).toBe("1");
    expect(normalizeQuestionNumber("1.")).toBe("1");
    expect(normalizeQuestionNumber("01번")).toBe("1");
    expect(normalizeQuestionNumber("#12")).toBe("12");
    expect(normalizeQuestionNumber("문제 3")).toBe("3");
    expect(normalizeQuestionNumber("[문제 10]")).toBe("10");
    expect(normalizeQuestionNumber("10.")).toBe("10");
    expect(normalizeQuestionNumber("10번")).toBe("10");
  });

  it("toggles important state while preserving existing metadata", () => {
    const current = [{
      questionNumber: "7",
      important: true,
      bookmarkLabel: "다시",
      note: "조건 확인",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }];

    const off = toggleQuestionImportant(current, "07", "2026-02-01T00:00:00.000Z");
    expect(off[0]).toEqual(expect.objectContaining({
      questionNumber: "7",
      important: false,
      bookmarkLabel: "다시",
      note: "조건 확인",
      updatedAt: "2026-02-01T00:00:00.000Z",
    }));

    const on = toggleQuestionImportant(off, "8", "2026-03-01T00:00:00.000Z");
    expect(on.at(-1)).toEqual(expect.objectContaining({
      questionNumber: "8",
      important: true,
    }));
  });
});
