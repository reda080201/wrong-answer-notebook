import { describe, expect, it } from "vitest";
import { createNavigationHistory } from "./navigationHistory";

describe("navigation history", () => {
  it("restores list context without persisting it", () => {
    const history = createNavigationHistory();
    history.push({ destination: "question_bank", search: "미분", inspectorId: "q9", scrollTop: 420 });
    history.push({ destination: "learning_hub", learningBlock: { entryId: "e1", blockId: "b2" } });
    expect(history.back()).toMatchObject({ destination: "question_bank", inspectorId: "q9", scrollTop: 420 });
    expect(history.forward()).toMatchObject({ destination: "learning_hub" });
  });
  it("does not create duplicate snapshots", () => {
    const history = createNavigationHistory();
    const snapshot = { destination: "library" as const, libraryPath: ["수학"] };
    history.push(snapshot); history.push(snapshot);
    expect(history.back()).toBeNull();
  });
  it("updates the current snapshot when a registered screen scrolls", () => {
    const history = createNavigationHistory();
    history.push({ destination: "question_bank", scrollTops: { list: 120 } });
    history.updateCurrent({ destination: "question_bank", scrollTops: { list: 640 } });
    history.push({ destination: "library" });
    expect(history.back()).toMatchObject({ destination: "question_bank", scrollTops: { list: 640 } });
  });
});
