import { describe, expect, it } from "vitest";
import {
  difficultyScoreBand,
  difficultyScoreLabel,
  estimateDifficultyScore,
  normalizeDifficultyScore,
  resolveQuestionDifficultyScore,
} from "./difficulty";

describe("difficulty score utilities", () => {
  it("normalizes numeric values into 1~100 integer scores", () => {
    expect(normalizeDifficultyScore("82.6")).toBe(83);
    expect(normalizeDifficultyScore(0)).toBe(1);
    expect(normalizeDifficultyScore(101)).toBe(100);
    expect(normalizeDifficultyScore("bad")).toBeUndefined();
    expect(normalizeDifficultyScore("")).toBeUndefined();
  });

  it("estimates scores from legacy difficulty fields", () => {
    expect(estimateDifficultyScore("high", false)).toBe(80);
    expect(estimateDifficultyScore("medium", false)).toBe(55);
    expect(estimateDifficultyScore("low", false)).toBe(25);
    expect(estimateDifficultyScore(undefined, true)).toBe(85);
    expect(estimateDifficultyScore("none", false)).toBe(0);
  });

  it("labels score bands", () => {
    expect(difficultyScoreBand(30)).toBe("easy");
    expect(difficultyScoreBand(60)).toBe("normal");
    expect(difficultyScoreBand(85)).toBe("hard");
    expect(difficultyScoreBand(86)).toBe("very-hard");
    expect(difficultyScoreLabel(91)).toBe("매우 어려움 · 91/100");
  });

  it("uses questionMeta score before answerKey score", () => {
    expect(
      resolveQuestionDifficultyScore(
        [{ questionNumber: "01", important: false, difficultyScore: 92, updatedAt: "2026-01-01T00:00:00.000Z" }],
        [{ id: "a", questionNumber: "1", answer: "", explanation: "", importantPoints: [], difficultyScore: 61 }],
        { displayNumber: 1, numberLabel: "01." },
      ),
    ).toBe(92);
  });
});
