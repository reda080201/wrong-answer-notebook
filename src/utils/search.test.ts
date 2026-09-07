import { describe, expect, it } from "vitest";
import { highlightTextSegments, parseSearchQuery, rankSearchCandidates } from "./search";

describe("shared search", () => {
  const candidates = [
    { id: "a", fields: { title: "미분의 극값", subject: "수학", unit: "미분" } },
    { id: "b", fields: { title: "확률", subject: "수학", unit: "경우의 수" } },
  ];
  it("supports fields, AND/OR and Korean initials", () => {
    expect(parseSearchQuery('subject:수학 "미분의 극값"').groups).toHaveLength(1);
    expect(parseSearchQuery('subject:"자연 과학"').groups[0]?.[0]).toMatchObject({ field: "subject", value: "자연 과학", phrase: true });
    expect(rankSearchCandidates(candidates, "ㅁㅂ").map((item) => item.id)).toEqual(["a"]);
    expect(rankSearchCandidates(candidates, "unit:미분 OR unit:경우").map((item) => item.id)).toEqual(["a", "b"]);
  });
  it("returns safe text segments without injecting markup", () => {
    expect(highlightTextSegments("<b>미분</b>", "미분")).toEqual([
      { value: "<b>", highlighted: false }, { value: "미분", highlighted: true }, { value: "</b>", highlighted: false },
    ]);
  });

  it.each(["(", "[", "+", "\\int", "https://example.com/a+b"])(
    "treats special search text literally: %s",
    (term) => {
      expect(() => highlightTextSegments(`앞 ${term} 뒤`, term)).not.toThrow();
      expect(highlightTextSegments(`앞 ${term} 뒤`, term)).toEqual([
        { value: "앞 ", highlighted: false },
        { value: term, highlighted: true },
        { value: " 뒤", highlighted: false },
      ]);
    },
  );

  it("does not treat an empty query as a wildcard", () => {
    expect(highlightTextSegments("원문", "")).toEqual([{ value: "원문", highlighted: false }]);
  });
});
