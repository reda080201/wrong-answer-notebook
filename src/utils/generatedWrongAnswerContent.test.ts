import { describe, expect, it } from "vitest";
import { resolveGeneratedWrongAnswerContent } from "./generatedWrongAnswerContent";

describe("resolveGeneratedWrongAnswerContent", () => {
  const segments = [{ id: "body", type: "text" as const, text: "문항" }];
  it("matches exact or normalized generated question keys", () => {
    expect(resolveGeneratedWrongAnswerContent({ generatedFromQuestionNumber: "2", questionContentSegments: { "1": segments, "2": segments } })).toMatchObject({ status: "matched", key: "2" });
    expect(resolveGeneratedWrongAnswerContent({ generatedFromQuestionNumber: "02번", questionContentSegments: { "2.": segments } })).toMatchObject({ status: "matched", key: "2." });
  });
  it("uses a single-key fallback and reports ambiguous maps", () => {
    expect(resolveGeneratedWrongAnswerContent({ generatedFromQuestionNumber: "3", questionContentSegments: { only: segments } })).toMatchObject({ status: "matched", key: "only" });
    expect(resolveGeneratedWrongAnswerContent({ generatedFromQuestionNumber: "3", questionContentSegments: { "1": segments, "2": segments } })).toEqual({ status: "ambiguous" });
    expect(resolveGeneratedWrongAnswerContent({ generatedFromQuestionNumber: "1", questionContentSegments: { "01": segments, "1.": segments } })).toEqual({ status: "ambiguous" });
  });
});
