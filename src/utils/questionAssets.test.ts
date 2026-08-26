import { describe, expect, it } from "vitest";
import { resolveQuestionAssets } from "./questionAssets";
import type { WrongAnswerEntry } from "../types";

const entry = {
  id: "sheet", entryKind: "problem_sheet", subject: "수학", title: "시험지", question: "", questionImages: ["global.png"], sourcePageImages: ["page-1.png", "page-2.png"], figures: [
    { id: "f-9", questionNumber: "9", title: "", caption: "", source: "original", original: { image: "figure-9.png", sourcePageImage: "page-2.png" } },
    { id: "f-10", questionNumber: "10", title: "", caption: "", source: "original", original: { image: "figure-10.png", sourcePageImage: "page-1.png" } },
  ], questionSourceCrops: [
    { id: "q9-a", questionNumber: "9", order: 0, image: "q9-a.png", sourcePageImage: "page-2.png" },
    { id: "q9-b", questionNumber: "9", order: 1, image: "q9-b.png", sourcePageImage: "page-2.png" },
  ], createdAt: "", updatedAt: "", tags: [], checklist: [], concepts: [], difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [],
} as unknown as WrongAnswerEntry;

describe("resolveQuestionAssets", () => {
  it("projects only the current question crops, figures, and source page", () => {
    const assets = resolveQuestionAssets(entry, { questionNumber: "9", figureIds: ["f-9"], source: { page: 2 } });
    expect(assets.sourceCrops.map((crop) => crop.image)).toEqual(["q9-a.png", "q9-b.png"]);
    expect(assets.figureAssets).toEqual(expect.arrayContaining(["figure-9.png"]));
    expect(assets.figureAssets).not.toContain("figure-10.png");
    expect(assets.sourcePages).toEqual(["page-2.png"]);
  });
});
