import { describe, expect, it } from "vitest";
import { resolveQuestionAssets } from "./questionAssets";
import type { WrongAnswerEntry } from "../types";

describe("resolveQuestionAssets", () => {
  it("uses canonical figure ids and excludes stale question-number matches", () => {
    const entry = { id: "e", title: "시험", subject: "수학", question: "", questionImages: [], figures: [
      { id: "f9", questionNumber: "9", title: "", caption: "", image: "f9.png", source: "original" },
      { id: "f10", questionNumber: "9", title: "", caption: "", image: "f10.png", source: "original" },
    ], questionSourceCrops: [
      { id: "crop-9", questionNumber: "9", order: 0, image: "q9.png" },
      { id: "crop-10", questionNumber: "10", order: 0, image: "q10.png" },
    ] } as WrongAnswerEntry;
    expect(resolveQuestionAssets(entry, { questionNumber: "9", figureIds: ["f9"] }).figures.map((figure) => figure.id)).toEqual(["f9"]);
    expect(resolveQuestionAssets(entry, { questionNumber: "9", figureIds: ["f9"] }).questionImages).toEqual(["q9.png"]);
  });
});
