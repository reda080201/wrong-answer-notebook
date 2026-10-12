import { describe, expect, it } from "vitest";
import { resolveCanonicalQuestionPresentation } from "./canonicalQuestionPresentation";

describe("canonical question presentation", () => {
  it.each(["3번", "3.", "문제 3"])("keeps a canonical body beginning with %s without supplementing a stripped fragment", (prefix) => {
    const text = `${prefix} 확인 문항입니다.`;
    const segments = [
      { id: "body", type: "text" as const, text },
      { id: "formula1", type: "equation" as const, latex: "x^2", display: true },
      { id: "formula2", type: "equation" as const, latex: "x^2", display: true },
    ];
    const result = resolveCanonicalQuestionPresentation(`${text}\n① 첫째\n② 둘째`, segments);
    expect(result.segments).toEqual(segments);
    expect(result.choices).toEqual(["① 첫째", "② 둘째"]);
  });

  it("strips a real source number absent from canonical prose while preserving legacy-only content", () => {
    const result = resolveCanonicalQuestionPresentation("3. 본문\n추가 조건입니다.\n① 첫째\n② 둘째", [{ id: "body", type: "text", text: "본문" }]);
    expect(result.segments.filter(s => s.type === "text").map(s => s.text)).toEqual(["본문", "추가 조건입니다."]);
  });
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
