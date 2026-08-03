import { describe, expect, it } from "vitest";
import { patchQuestionClassification } from "./patchQuestionClassification";

describe("patchQuestionClassification", () => {
  it("updates normalized question numbers without appending a duplicate", () => {
    const result = patchQuestionClassification([
      { questionNumber: "01", important: true, needsReview: false, updatedAt: "old", classification: { unit: "기존" } },
      { questionNumber: "1번", important: false, needsReview: false, updatedAt: "old", classification: { unit: "중복" } },
    ], "문항 1", { classification: { unit: "함수" }, difficultyScore: 82, importanceScore: 91, qualityScore: 75 }, "now");
    expect(result).toEqual([expect.objectContaining({ questionNumber: "01", important: true, difficultyScore: 82, rating: { importanceScore: 91, qualityScore: 75 }, classification: { unit: "함수" }, updatedAt: "now" })]);
  });

  it("preserves existing rating fields when a score is not edited", () => {
    const [result] = patchQuestionClassification([
      { questionNumber: "1", important: false, difficultyScore: 66, rating: { importanceScore: 80, userQualityScore: 70 }, updatedAt: "old", classification: { unit: "기존" } },
    ], "1", { classification: { unit: "새 단원" } }, "now");
    expect(result).toMatchObject({ difficultyScore: 66, rating: { importanceScore: 80, userQualityScore: 70 }, classification: { unit: "새 단원" } });
  });
});
