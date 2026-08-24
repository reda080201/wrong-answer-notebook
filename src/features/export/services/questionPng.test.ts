import { describe, expect, it } from "vitest";
import { canonicalQuestionFingerprint } from "./questionPng";

describe("canonicalQuestionFingerprint", () => {
  it("is deterministic and changes when canonical content changes", () => {
    expect(canonicalQuestionFingerprint("9. $x^2$")).toBe(canonicalQuestionFingerprint("9. $x^2$"));
    expect(canonicalQuestionFingerprint("9. $x^2$")).not.toBe(canonicalQuestionFingerprint("9. $x^3$"));
  });
});
