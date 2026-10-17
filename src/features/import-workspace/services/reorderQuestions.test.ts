import { describe, expect, it } from "vitest";
import { moveQuestion } from "./reorderQuestions";
import { questionDraftToEntryData, type ImportDraftGroup } from "../model/importWorkspace";

const group = (id: string, ids: string[]): ImportDraftGroup => ({
  id, title: id, questions: ids.map((questionId, order) => ({
    id: questionId, groupId: id, order, displayQuestionNumber: String(order + 1), sourceQuestionNumber: String(order + 1),
    contentSegments: [{ id: `${questionId}-segment`, type: "text", text: questionId }], choices: [], figures: [], questionImageAssets: [], sourcePageAssets: [], explanationParts: [], sourceReferences: [], status: "ready", warnings: [],
  })), answerItems: [], sourceFileIds: [], userConfirmed: false,
});

describe("import workspace question movement", () => {
  it("moves source crops and confirmed solution hotspots with the question", () => {
    const a = group("a", ["a1"]), b = group("b", ["b2", "b3"]);
    a.questions[0].sourcePageAssets = ["a.png"];
    b.questions = b.questions.map((question, index) => ({ ...question, displayQuestionNumber: String(index + 2), sourcePageAssets: ["b.png"], source: { page: 1 } }));
    b.entryMetadata = { questionSourceCrops: [{ id: "crop", questionNumber: "2", page: 1, image: "crop.png" }], questionSolutionHotspots: [{ id: "dot", questionKey: '["2",""]', sourcePageImage: "b.png", x: .1, y: .2 }] };
    const moved = moveQuestion([a, b], "b2", "a", 1);
    const saved = questionDraftToEntryData(moved[0]);
    expect(saved.questionSourceCrops).toEqual([{ id: "crop", questionNumber: "2", page: 2, sourcePageImage: "b.png", image: "crop.png" }]);
    expect(saved.questionSolutionHotspots).toEqual(b.entryMetadata.questionSolutionHotspots);
    expect(moved[1].entryMetadata?.questionSourceCrops).toEqual([]);
    expect(moved[1].entryMetadata?.questionSolutionHotspots).toEqual([]);
    expect(b.entryMetadata.questionSourceCrops?.[0].page).toBe(1);
  });
  it("rebases each question's source page after cross-group moves and reorder without changing the draft", () => {
    const a = group("a", ["a1"]), b = group("b", ["b2", "b3"]);
    a.questions[0] = { ...a.questions[0], sourcePageAssets: ["a.png"], source: { page: 1 } };
    b.questions = b.questions.map((question, index) => ({ ...question, displayQuestionNumber: String(index + 2), sourcePageAssets: ["b.png"], source: { page: 1 } }));
    const moved = moveQuestion([a, b], "b2", "a", 0);
    const before = structuredClone(moved);
    const saved = questionDraftToEntryData(moved[0]);
    expect(saved.sourcePageImages).toEqual(["b.png", "a.png"]);
    expect(saved.structuredQuestions?.map(question => question.source?.page)).toEqual([1, 2]);
    const reordered = questionDraftToEntryData(moveQuestion(moved, "b2", "a", 1)[0]);
    expect(reordered.sourcePageImages).toEqual(["a.png", "b.png"]);
    expect(reordered.structuredQuestions?.map(question => question.source?.page)).toEqual([1, 2]);
    expect(moved).toEqual(before);
  });
  it("moves a question and normalizes order", () => {
    const result = moveQuestion([group("a", ["a1", "a2"]), group("b", ["b1"])], "a2", "b", 1);
    expect(result[0].questions.map((question) => question.id)).toEqual(["a1"]);
    expect(result[1].questions.map((question) => question.id)).toEqual(["b1", "a2"]);
    expect(result[1].questions.map((question) => question.order)).toEqual([0, 1]);
  });
});

