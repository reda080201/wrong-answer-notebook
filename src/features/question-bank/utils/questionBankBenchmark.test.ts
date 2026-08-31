import { describe, expect, it } from "vitest";
import { benchmarkQuestionBank } from "./questionBankBenchmark";

describe("Question Bank benchmark fixture", () => {
  it.each([1_000, 5_000, 10_000])("filters and groups %i canonical items", (size) => {
    const result = benchmarkQuestionBank(size);
    expect(result.matched).toBeGreaterThan(0);
    // This documents the profile input; CI machines vary too much for a timing gate.
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
