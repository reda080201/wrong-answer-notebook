import { describe, expect, it } from "vitest";
import { moveQuestion } from "./reorderQuestions";
import type { ImportDraftGroup } from "../model/importWorkspace";

const group = (id: string, ids: string[]): ImportDraftGroup => ({
  id, title: id, questions: ids.map((questionId, order) => ({
    id: questionId, groupId: id, order, displayQuestionNumber: String(order + 1), sourceQuestionNumber: String(order + 1),
    contentSegments: [{ id: `${questionId}-segment`, type: "text", text: questionId }], choices: [], figures: [], questionImageAssets: [], sourcePageAssets: [], explanationParts: [], sourceReferences: [], status: "ready", warnings: [],
  })), answerItems: [], sourceFileIds: [], userConfirmed: false,
});

describe("import workspace question movement", () => {
  it("moves a question and normalizes order", () => {
    const result = moveQuestion([group("a", ["a1", "a2"]), group("b", ["b1"])], "a2", "b", 1);
    expect(result[0].questions.map((question) => question.id)).toEqual(["a1"]);
    expect(result[1].questions.map((question) => question.id)).toEqual(["b1", "a2"]);
    expect(result[1].questions.map((question) => question.order)).toEqual([0, 1]);
  });
});

