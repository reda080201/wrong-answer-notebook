import { describe, expect, it } from "vitest";
import {
  normalizeImportedMathCommands,
  normalizeLegacyMathCommandsForDisplay,
} from "./legacyMathCommands";

describe("legacy math command normalization", () => {
  it("converts only allowlisted slash commands at token boundaries", () => {
    expect(normalizeLegacyMathCommandsForDisplay("/lim x /frac{1}{2} /sqrt{x} /sum /int /sin /cos /tan /log /left /right"))
      .toBe("\\lim x \\frac{1}{2} \\sqrt{x} \\sum \\int \\sin \\cos \\tan \\log \\left \\right");
    expect(normalizeLegacyMathCommandsForDisplay("/limit /fraction /sine /unknown foo/frac 문제/lim /lim함수"))
      .toBe("/limit /fraction /sine /unknown foo/frac 문제/lim /lim함수");
  });

  it("preserves ordinary slash text, URLs, and filesystem paths", () => {
    const value = "3/4 x/y 문제/정답 https://example.com/frac C:/math/frac/file.tex /usr/local/frac/file ./frac ../frac ~/frac";
    expect(normalizeLegacyMathCommandsForDisplay(value)).toBe(value);
  });

  it("keeps display normalization pure and shares the import behavior", () => {
    const value = "풀이 /frac{1}{2}";
    expect(normalizeLegacyMathCommandsForDisplay(value)).toBe("풀이 \\frac{1}{2}");
    expect(normalizeImportedMathCommands(value)).toBe("풀이 \\frac{1}{2}");
    expect(value).toBe("풀이 /frac{1}{2}");
  });
});
