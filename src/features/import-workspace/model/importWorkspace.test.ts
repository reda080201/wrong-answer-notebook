import { describe, expect, it } from "vitest";
import { questionDraftToEntryData } from "./importWorkspace";

describe("import workspace image separation", () => {
  it("keeps question images separate from source page images", () => {
    const result = questionDraftToEntryData({
      id: "group-1",
      title: "1회",
      questions: [{
        id: "question-1",
        groupId: "group-1",
        order: 0,
        displayQuestionNumber: "1",
        sourceQuestionNumber: "1",
        contentSegments: [{ id: "segment-1", type: "text", text: "문제" }],
        choices: [],
        figures: [],
        questionImageAssets: ["figure.png"],
        sourcePageAssets: ["source-page.png"],
        explanationParts: [],
        sourceReferences: [],
        status: "ready",
        warnings: [],
      }],
      answerItems: [],
      sourceFileIds: [],
      userConfirmed: true,
    });

    expect(result.questionImages).toEqual(["figure.png"]);
    expect(result.sourcePageImages).toEqual(["source-page.png"]);
  });
});
