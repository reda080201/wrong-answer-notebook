import { describe, expect, it } from "vitest";
import { resolveCanonicalQuestionPresentation } from "./canonicalQuestionPresentation";

describe("canonical question presentation", () => {
  it("separates choices from the compatibility string and keeps canonical order", () => {
    const result = resolveCanonicalQuestionPresentation("본문 앞\n(가) 조건\n\\(x^2\\)\n① 첫째\n② 둘째", [
      { id: "body", type: "text", text: "본문 앞" },
      { id: "condition", type: "condition", label: "(가)", text: "조건" },
      { id: "equation", type: "equation", latex: "x^2", display: false },
    ]);
    expect(result.parsed).toBe(true);
    expect(result.segments.map((segment) => segment.id)).toEqual(["body", "condition", "equation"]);
    expect(result.choices).toEqual(["① 첫째", "② 둘째"]);
  });

  it("preserves the original compatibility text and avoids extracting choices when parsing is ambiguous", () => {
    const segments = [{ id: "keep", type: "text" as const, text: "본문" }];
    const result = resolveCanonicalQuestionPresentation("1. 하나\n① 보기\n\n2. 둘\n② 보기", segments);
    expect(result.parsed).toBe(false);
    expect(result.choices).toEqual([]);
    expect(result.segments[0]).toEqual(segments[0]);
    expect(result.segments.some((segment) => segment.type === "text" && segment.text.includes("② 보기"))).toBe(true);
  });
});
