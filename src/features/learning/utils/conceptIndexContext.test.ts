import { describe, expect, it } from "vitest";
import { buildConceptLinkContext } from "./conceptIndex";

describe("buildConceptLinkContext", () => {
  it("uses normalized metadata numbering for solution unit context", () => {
    const entry = {
      id: "entry",
      subject: "수학",
      questionMeta: [{ questionNumber: "01", classification: { unit: "미분" } }],
    } as never;
    expect(buildConceptLinkContext(entry, "1번")).toMatchObject({
      sourceEntry: entry,
      unit: "미분",
    });
  });
});
