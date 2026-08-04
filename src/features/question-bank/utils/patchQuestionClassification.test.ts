import { describe, expect, it } from "vitest";
import { patchQuestionClassification } from "./patchQuestionClassification";

describe("patchQuestionClassification", () => {
  it("updates normalized question numbers without appending a duplicate", () => {
    const result = patchQuestionClassification([
      { questionNumber: "01", important: true, needsReview: false, updatedAt: "old", classification: { unit: "기존" } },
      { questionNumber: "1번", important: false, needsReview: false, updatedAt: "old", classification: { unit: "중복" } },
    ], "문항 1", { unit: "함수" }, "now");
    expect(result).toEqual([expect.objectContaining({ questionNumber: "01", important: true, classification: { unit: "함수" }, updatedAt: "now" })]);
  });
});
