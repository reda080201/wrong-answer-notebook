import { describe, expect, it } from "vitest";
import { buildQuestionExportComposition, buildQuestionRenderDescriptor, buildQuestionRenderFingerprint, canonicalQuestionFingerprint, QUESTION_PNG_RENDERER_VERSION } from "./questionPng";

describe("canonicalQuestionFingerprint", () => {
  it("is deterministic and changes when canonical content changes", () => {
    expect(canonicalQuestionFingerprint("9. $x^2$")).toBe(canonicalQuestionFingerprint("9. $x^2$"));
    expect(canonicalQuestionFingerprint("9. $x^2$")).not.toBe(canonicalQuestionFingerprint("9. $x^3$"));
  });
});

describe("canonical question PNG descriptor", () => {
  const question = { questionNumber: "9", position: 1, questionText: "문제", conditions: [], equations: [], choices: ["① 1"], figureIds: [], contentSegments: [{ id: "text-1", type: "text" as const, text: "문제" }] };

  it("changes per scope without reading live study UI state", () => {
    const questionOnly = buildQuestionRenderDescriptor({ question, figures: [], answer: "①", explanation: "풀이", scope: "question" });
    const withAnswer = buildQuestionRenderDescriptor({ question, figures: [], answer: "①", explanation: "풀이", scope: "question_answer" });
    expect(buildQuestionRenderFingerprint(questionOnly)).not.toBe(buildQuestionRenderFingerprint(withAnswer));
    expect(questionOnly).toMatchObject({ rendererVersion: QUESTION_PNG_RENDERER_VERSION, scope: "question", answer: undefined });
  });

  it("adds missing canonical fields without duplicating ordered content", () => {
    const result = buildQuestionExportComposition({ ...question, conditions: ["x > 0"], equations: ["x + 1 = 2"], figureIds: ["figure-1"] });
    expect(result.segments.map((segment) => segment.type)).toEqual(["text", "condition", "equation", "figure"]);
    expect(result.placementWarnings).toHaveLength(1);
  });
});

describe("buildQuestionRenderFingerprint", () => {
  it("is independent from object key insertion order and includes figure identity", () => {
    const first = buildQuestionRenderFingerprint({ question: { number: "9", text: "x" }, figures: [{ id: "f1", image: "a.png" }] });
    const reordered = buildQuestionRenderFingerprint({ figures: [{ image: "a.png", id: "f1" }], question: { text: "x", number: "9" } });
    const changedFigure = buildQuestionRenderFingerprint({ question: { number: "9", text: "x" }, figures: [{ id: "f1", image: "b.png" }] });
    expect(first).toBe(reordered);
    expect(first).not.toBe(changedFigure);
  });
});
