import { describe, expect, it } from "vitest";
import { detectSuspiciousTextSegments } from "./suspiciousText";

describe("detectSuspiciousTextSegments", () => {
  it("detects known OCR fragments and excessive symbols", () => {
    const segments = detectSuspiciousTextSegments("1. 밀죳 값을 구하라\n@@@ ### ???");

    expect(segments.some((segment) => segment.reason === "OCR 의심 조각")).toBe(true);
    expect(segments.some((segment) => segment.reason === "기호 비율 과다")).toBe(true);
  });

  it("keeps ordinary textbook text quiet", () => {
    expect(detectSuspiciousTextSegments("1. 함수 f(x)=x^2의 최솟값을 구하시오.\n① 0 ② 1")).toHaveLength(0);
  });

  it.each(["f′(2)", "f″(x)", "f‴(x)", "f’(x)", "x² + aₙ", "∏_{k=1}^{n} k"])("accepts supported math characters in Korean prose: %s", (formula) => {
    expect(detectSuspiciousTextSegments(`함수 ${formula}의 값을 구하시오.`)).toHaveLength(0);
  });

  it("continues to warn about replacement and unknown characters", () => {
    expect(detectSuspiciousTextSegments("함수 f�(x)의 값은?").some(segment => segment.reason === "깨진 문자 가능성")).toBe(true);
  });

  it("accepts a formula line with multiple supported superscripts and subscripts", () => {
    expect(detectSuspiciousTextSegments("x²³⁴ + y₁₂₃ = z₄₅₆")).toHaveLength(0);
  });

  it("does not flag LaTeX and ordinary mathematical unicode as suspicious prose", () => {
    const segments = detectSuspiciousTextSegments("\\frac{1}{2} + \\sqrt{x} = π\n∑_{k=1}^{n} k ≤ 10");
    expect(segments.some((segment) => segment.reason === "기호 비율 과다")).toBe(false);
  });
});
