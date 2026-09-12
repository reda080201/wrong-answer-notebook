import { describe, expect, it } from "vitest";
import type { StructuredQuestion } from "../types";
import { getEntryQuestions } from "./entryQuestions";

describe("getEntryQuestions semantic projection", () => {
  it("treats canonical content segments as authoritative and preserves their order", () => {
    const question: StructuredQuestion = {
      questionNumber: "07",
      section: "수학 II",
      questionType: "multiple_choice",
      points: 4,
      questionText: "함수의 값을 구하시오.",
      conditions: ["x > 0", "y > 0"],
      equations: ["x + y = 1"],
      choices: [],
      contentSegments: [
        { id: "condition-existing", type: "condition", text: "x > 0" },
        { id: "figure-slot", type: "figure", figureId: "figure-1" },
      ],
      source: { title: "기출", page: 3, reference: "p. 3" },
      needsReview: false,
      warning: "원본 확인 필요",
      figureIds: ["figure-1"],
    };

    const resolved = getEntryQuestions({ question: "", structuredQuestions: [question], questionContentSegments: undefined })[0];
    expect(resolved).toMatchObject({
      questionNumber: "7",
      section: "수학 II",
      questionType: "multiple_choice",
      questionText: "함수의 값을 구하시오.",
      conditions: ["x > 0", "y > 0"],
      equations: ["x + y = 1"],
      choices: [],
      needsReview: true,
      warning: expect.stringContaining("선택지가 없어"),
      points: 4,
      figureIds: ["figure-1"],
      source: { title: "기출", page: 3, reference: "p. 3" },
    });
    expect(resolved.contentSegments).toEqual([
      { id: "condition-existing", type: "condition", text: "x > 0" },
      { id: "figure-slot", type: "figure", figureId: "figure-1" },
      { id: "question-text", type: "text", text: "함수의 값을 구하시오." },
      { id: "condition-2", type: "condition", text: "y > 0" },
      { id: "equation-1", type: "equation", latex: "x + y = 1", display: true },
    ]);

    question.conditions.push("mutated");
    question.contentSegments[0] = { id: "changed", type: "text", text: "changed" };
    question.source!.title = "changed";
    expect(resolved.conditions).toEqual(["x > 0", "y > 0"]);
    expect(resolved.contentSegments?.[0]).toEqual({ id: "condition-existing", type: "condition", text: "x > 0" });
    expect(resolved.source?.title).toBe("기출");
  });

  it("builds fallback semantic segments once when canonical segments are absent", () => {
    const [resolved] = getEntryQuestions({
      question: "",
      structuredQuestions: [{
        questionNumber: "1",
        questionText: "본문",
        conditions: ["x > 0", "x > 0"],
        equations: ["x+y=1"],
        choices: [],
        contentSegments: [],
        figureIds: [],
      }],
      questionContentSegments: undefined,
    });

    expect(resolved.contentSegments).toEqual([
      { id: "question-text", type: "text", text: "본문" },
      { id: "condition-1", type: "condition", text: "x > 0" },
      { id: "equation-1", type: "equation", latex: "x+y=1", display: true },
    ]);
  });

  it("preserves missing legacy semantics without deduping the canonical stream", () => {
    const [resolved] = getEntryQuestions({
      question: "",
      structuredQuestions: [{
        questionNumber: "1",
        questionText: "본문",
        conditions: ["(가) x > 0"],
        equations: ["\\frac{1}{2}"],
        choices: [],
        contentSegments: [
          { id: "text", type: "text", text: "본문" },
          { id: "first-equation", type: "equation", latex: "\\frac{1}{2}", display: true },
          { id: "second-equation", type: "equation", latex: "\\frac{1}{2}", display: true },
          { id: "condition", type: "condition", label: "(가)", text: "x > 0" },
          { id: "figure", type: "figure", figureId: "figure-1" },
          { id: "table", type: "table", rows: [["값"]] },
        ],
        figureIds: ["figure-1"],
      }],
      questionContentSegments: undefined,
    });

    expect(resolved.contentSegments).toEqual([
      { id: "text", type: "text", text: "본문" },
      { id: "first-equation", type: "equation", latex: "\\frac{1}{2}", display: true },
      { id: "second-equation", type: "equation", latex: "\\frac{1}{2}", display: true },
      { id: "condition", type: "condition", label: "(가)", text: "x > 0" },
      { id: "figure", type: "figure", figureId: "figure-1" },
      { id: "table", type: "table", rows: [["값"]] },
    ]);
  });

  it("does not invent choices for an empty multiple-choice question", () => {
    const [resolved] = getEntryQuestions({
      question: "",
      structuredQuestions: [{
        questionNumber: "1",
        questionType: "multiple_choice",
        questionText: "문제",
        conditions: [],
        equations: [],
        choices: [],
        contentSegments: [],
        figureIds: [],
      }],
      questionContentSegments: undefined,
    });

    expect(resolved.questionType).toBe("multiple_choice");
    expect(resolved.choices).toEqual([]);
    expect(resolved.needsReview).toBe(true);
    expect(resolved.warning).toContain("선택지가 없어");
  });

  it("keeps non-contiguous source numbers separate from navigation positions", () => {
    const questions = getEntryQuestions({
      question: "1. legacy projection must not win",
      structuredQuestions: ["9", "10", "20", "30"].map((questionNumber) => ({
        questionNumber,
        questionText: `${questionNumber}번 본문`,
        conditions: [],
        equations: [],
        choices: [],
        contentSegments: [{ id: `text-${questionNumber}`, type: "text" as const, text: `${questionNumber}번 본문` }],
        figureIds: [],
      })),
      questionContentSegments: undefined,
    });

    expect(questions.map((item) => item.questionNumber)).toEqual(["9", "10", "20", "30"]);
    expect(questions.map((item) => item.position)).toEqual([1, 2, 3, 4]);
  });
});
