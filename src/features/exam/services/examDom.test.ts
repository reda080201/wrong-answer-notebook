import { describe, expect, it } from "vitest";
import { sanitizeExamQuestionDomId } from "./examDom";

describe("sanitizeExamQuestionDomId", () => {
  it.each(["20", "9-1", "가", "1 (공통)"])("creates a selector-safe stable id for %s", (number) => {
    const id = sanitizeExamQuestionDomId(number);
    expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    expect(sanitizeExamQuestionDomId(number)).toBe(id);
  });
});
