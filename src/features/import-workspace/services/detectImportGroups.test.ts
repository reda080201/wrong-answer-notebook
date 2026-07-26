import { describe, expect, it } from "vitest";
import { detectRoundLabel, suggestRoundBreaks } from "./detectImportGroups";

describe("import workspace group detection", () => {
  it("detects round labels from common file names", () => {
    expect(detectRoundLabel("수학 모의고사 3회 문제지.pdf").label).toBe("3");
    expect(detectRoundLabel("answer_day_2.json").label).toBe("2");
  });

  it("suggests a break when source numbering restarts", () => {
    expect(suggestRoundBreaks(["1", "2", "22", "1", "2", "3"])).toEqual([3]);
  });
});
