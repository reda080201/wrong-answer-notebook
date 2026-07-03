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
});
