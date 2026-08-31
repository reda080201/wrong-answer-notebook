import { describe, expect, it } from "vitest";
import { highlightTextSegments, parseSearchQuery, rankSearchCandidate } from "./searchEngine";

describe("searchEngine", () => {
  it("supports whitespace AND, quoted phrases, Korean initials and ranking", () => {
    const candidate = { title: "미분의 극값", subject: "수학", body: "함수의 최대 최소" };
    expect(rankSearchCandidate(candidate, "미분 극값").matched).toBe(true);
    expect(rankSearchCandidate(candidate, '"미분의 극값"').rank).toBe("title-exact");
    expect(rankSearchCandidate({ title: "함수" }, "ㅎㅅ").matched).toBe(true);
    expect(rankSearchCandidate({ title: "미분법" }, "ㅁㅂ").matched).toBe(true);
    expect(rankSearchCandidate({ title: "적분" }, "미분 OR 적분").matched).toBe(true);
    expect(rankSearchCandidate({ title: "적분", subject: "수학" }, "subject:수학").matched).toBe(true);
    expect(rankSearchCandidate({ title: "함수", subject: "수학", unit: "미분" }, "subject:국어").matched).toBe(false);
    expect(rankSearchCandidate({ title: "함수", subject: "수학", unit: "미분" }, "unit:미분").matched).toBe(true);
  });
  it("keeps syntax diagnostics and safe plain-text highlighting", () => {
    expect(parseSearchQuery('"미분').syntaxError).toBeTruthy();
    expect(highlightTextSegments("<미분>", "미분")).toEqual([
      { value: "<", highlighted: false }, { value: "미분", highlighted: true }, { value: ">", highlighted: false },
    ]);
  });
});
