import { describe, expect, it } from "vitest";
import { normalizeLegacyLectureMathForDisplay } from "./legacyLectureMath";

describe("normalizeLegacyLectureMathForDisplay", () => {
  it("converts a clear plaintext limit with an arrow", () => {
    expect(normalizeLegacyLectureMathForDisplay("lim x→0 (sin x)/(x)"))
      .toBe("\\(\\lim_{x\\to 0} \\frac{sin x}{x}\\)");
  });

  it("converts a labeled fraction but does not guess ordinary slash expressions", () => {
    expect(normalizeLegacyLectureMathForDisplay("분수 1/2")).toBe("\\(\\frac{1}{2}\\)");
    expect(normalizeLegacyLectureMathForDisplay("1/2")).toBe("1/2");
    expect(normalizeLegacyLectureMathForDisplay("x/y와 a/b+c")).toBe("x/y와 a/b+c");
  });

  it("converts only parenthesized numerator and denominator groups", () => {
    expect(normalizeLegacyLectureMathForDisplay("(x+1)/(x-1)"))
      .toBe("\\frac{x+1}{x-1}");
    expect(normalizeLegacyLectureMathForDisplay("f(10, 20) / g(10, 20)"))
      .toBe("f(10, 20) / g(10, 20)");
  });

  it("preserves explicit math, prose, and line structure", () => {
    const source = "정의\n\\frac{1}{2}\nlimiting section\n1/2";
    expect(normalizeLegacyLectureMathForDisplay(source)).toBe(source);
  });

  it("is display-only and does not mutate the source string", () => {
    const source = "분수 3/4";
    const result = normalizeLegacyLectureMathForDisplay(source);
    expect(source).toBe("분수 3/4");
    expect(result).not.toBe(source);
  });
});
