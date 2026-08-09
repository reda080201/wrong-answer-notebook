import { describe, expect, it } from "vitest";
import type { LearningBlock } from "./types";
import { appendUniqueLearningBlocks } from "./App";

const block = (sourceQuestionNumber: string, overrides: Partial<LearningBlock> = {}): LearningBlock => ({
  id: `${sourceQuestionNumber}-block`,
  type: "concept",
  title: "핵심 개념",
  content: "내용",
  sourceQuestionNumber,
  ...overrides,
});

describe("appendUniqueLearningBlocks", () => {
  it("treats 01 and 1번 as the same source question when deduplicating", () => {
    const existing = block("01");

    const result = appendUniqueLearningBlocks([existing], [block("1번")]);

    expect(result).toEqual([existing]);
  });

  it("preserves the existing type and title comparison", () => {
    const existing = block("01");

    const result = appendUniqueLearningBlocks([existing], [
      block("1번", { type: "routine" }),
      block("1번", { title: "다른 개념" }),
    ]);

    expect(result).toHaveLength(3);
  });
});
