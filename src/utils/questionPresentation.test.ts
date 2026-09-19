import { describe, expect, it } from "vitest";
import { normalizeQuestionPresentationSegments } from "./questionPresentation";

describe("normalizeQuestionPresentationSegments", () => {
  it("does not append a legacy whole-question duplicate when conditions and equations are represented", () => {
    const segments = normalizeQuestionPresentationSegments({
      questionText: "본문\n(가) A\n(나) B\n값을 구하시오.",
      conditions: ["(가) A", "(나) B"],
      equations: [],
      contentSegments: [
        { id: "stem", type: "text", text: "본문" },
        { id: "a", type: "condition", label: "(가)", text: "A" },
        { id: "b", type: "condition", label: "(나)", text: "B" },
        { id: "end", type: "text", text: "값을 구하시오." },
      ],
    });
    expect(segments).toHaveLength(4);
    expect(segments.map((segment) => segment.id)).toEqual(["stem", "a", "b", "end"]);
    expect(segments.some((segment) => segment.type === "text" && /\([가-힣]\)/.test(segment.text))).toBe(false);
  });

  it("does not remove a condition body from an unrelated legacy stem", () => {
    const segments = normalizeQuestionPresentationSegments({
      questionText: "A의 값을 구하시오.",
      conditions: [],
      equations: [],
      contentSegments: [
        { id: "condition", type: "condition", label: "(가)", text: "A" },
      ],
    });

    expect(segments).toHaveLength(2);
    expect(segments[1]).toMatchObject({ type: "text", text: "A의 값을 구하시오." });
  });

  it("keeps an unmatched legacy stem and normalizes a repeated condition label", () => {
    const segments = normalizeQuestionPresentationSegments({
      questionText: "다음 조건을 만족하는 함수에 대하여",
      conditions: [],
      equations: [],
      contentSegments: [
        { id: "condition", type: "condition", label: "(가)", text: "(가) x > 0" },
        { id: "figure", type: "figure", figureId: "figure-1" },
      ],
    });
    expect(segments.map((segment) => segment.type)).toEqual(["condition", "figure", "text"]);
    expect(segments[0]).toMatchObject({ label: "(가)", text: "x > 0" });
    expect(segments[2]).toMatchObject({ text: "다음 조건을 만족하는 함수에 대하여" });
  });

  it("preserves figure and table order and intentional equation duplicates", () => {
    const segments = normalizeQuestionPresentationSegments({
      questionText: "",
      conditions: [],
      equations: [],
      contentSegments: [
        { id: "eq-1", type: "equation", latex: "x", display: true },
        { id: "figure", type: "figure", figureId: "f" },
        { id: "table", type: "table", rows: [["t"]] },
        { id: "eq-2", type: "equation", latex: "x", display: true },
      ],
    });
    expect(segments.map((segment) => segment.id)).toEqual(["eq-1", "figure", "table", "eq-2"]);
  });

  it("keeps canonical order and intentional duplicates while supplementing missing legacy semantics", () => {
    const segments = normalizeQuestionPresentationSegments({
      questionText: "본문",
      conditions: ["(가) x > 0", "추가 조건"],
      equations: ["\\(x+1\\)"],
      contentSegments: [
        { id: "text-1", type: "text", text: "본문" },
        { id: "equation-1", type: "equation", latex: "x+1", display: true },
        { id: "equation-2", type: "equation", latex: "x+1", display: true },
        { id: "figure-1", type: "figure", figureId: "figure-1" },
        { id: "table-1", type: "table", rows: [["표"]] },
        { id: "condition-1", type: "condition", label: "(가)", text: "x > 0" },
      ],
    });

    expect(segments.map((segment) => segment.id)).toEqual([
      "text-1", "equation-1", "equation-2", "figure-1", "table-1", "condition-1", "condition-2",
    ]);
  });

  it("removes only exact represented fragments from a legacy text fallback", () => {
    const segments = normalizeQuestionPresentationSegments({
      questionText: "본문 앞부분. 이어서 추가로 읽을 문장입니다.",
      conditions: [],
      equations: ["x+1"],
      contentSegments: [
        { id: "text-1", type: "text", text: "본문 앞부분." },
        { id: "equation-1", type: "equation", latex: "x+1", display: true },
      ],
    });

    expect(segments.map((segment) => segment.type)).toEqual(["text", "equation", "text"]);
    expect(segments[2]).toMatchObject({ type: "text", text: "이어서 추가로 읽을 문장입니다." });
  });

  it("keeps unmatched text in its exact line position when a legacy line partially overlaps", () => {
    const segments = normalizeQuestionPresentationSegments({
      questionText: "첫 문장. 추가 문장.\n(가) A\n값을 구하시오.",
      conditions: ["(가) A"],
      equations: [],
      contentSegments: [
        { id: "stem", type: "text", text: "첫 문장." },
        { id: "condition", type: "condition", label: "(가)", text: "A" },
        { id: "end", type: "text", text: "값을 구하시오." },
      ],
    });

    expect(segments.map((segment) => segment.type === "equation" ? segment.latex : segment.type === "table" || segment.type === "figure" ? segment.type : segment.text)).toEqual([
      "첫 문장.", "추가 문장.", "A", "값을 구하시오.",
    ]);
  });
});
