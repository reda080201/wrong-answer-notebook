import { describe, expect, it } from "vitest";
import { getQuestionNavigationIndex, normalizeProblemSheetDisplayMode } from "./studyNavigation";

describe("study navigation", () => {
  it("normalizes legacy and new display modes", () => {
    expect(normalizeProblemSheetDisplayMode("questions")).toBe("continuous");
    expect(normalizeProblemSheetDisplayMode("one_question")).toBe("one_question");
    expect(normalizeProblemSheetDisplayMode("unknown")).toBe("continuous");
  });
  it("clamps keyboard navigation at document edges", () => {
    expect(getQuestionNavigationIndex(0, -1, 5)).toBe(0);
    expect(getQuestionNavigationIndex(4, 1, 5)).toBe(4);
  });
});
