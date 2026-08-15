import { describe, expect, it } from "vitest";
import { scheduleManualStudyReview } from "./studyItems";

describe("manual study ordering", () => {
  it("repeats again immediately and hard later without scheduling fields", () => {
    expect(scheduleManualStudyReview(["a", "b", "c", "d"], "b", "again")).toEqual(["b", "a", "c", "d"]);
    expect(scheduleManualStudyReview(["a", "b", "c", "d"], "a", "hard")).toEqual(["b", "c", "d", "a"]);
    expect(scheduleManualStudyReview(["a", "b"], "a", "known")).toEqual(["b"]);
  });
});
