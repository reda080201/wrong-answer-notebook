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

  it("round-trips two structured questions and keeps an edited question", () => {
    const result = questionDraftToEntryData({
      id: "group-structured",
      title: "구조화 시험지",
      questions: [
        {
          id: "question-1",
          groupId: "group-structured",
          order: 0,
          displayQuestionNumber: "1",
          sourceQuestionNumber: "1",
          section: "대수",
          questionType: "서술형",
          conditions: ["x > 0"],
          equations: ["x + 1 = 2"],
          points: 4,
          sourceText: "수정된 첫 문제",
          contentSegments: [{ id: "segment-1", type: "text", text: "첫 문제" }],
          choices: [{ id: "choice-1", marker: "①", content: "1" }],
          figures: [],
          questionImageAssets: [],
          sourcePageAssets: [],
          explanationParts: [],
          sourceReferences: [],
          status: "needs_review",
          warnings: ["확인 필요"],
          needsReview: true,
          warning: "확인 필요",
          source: { title: "시험지", page: 2 },
          figureIds: ["figure-1"],
        },
        {
          id: "question-2",
          groupId: "group-structured",
          order: 1,
          displayQuestionNumber: "2",
          sourceQuestionNumber: "2",
          conditions: [],
          equations: [],
          points: 2,
          contentSegments: [{ id: "segment-2", type: "text", text: "둘째 문제" }],
          choices: [],
          figures: [],
          questionImageAssets: [],
          sourcePageAssets: [],
          explanationParts: [],
          sourceReferences: [],
          status: "ready",
          warnings: [],
          figureIds: [],
        },
      ],
      answerItems: [],
      sourceFileIds: [],
      userConfirmed: true,
    });

    expect(result.structuredQuestions).toEqual([
      expect.objectContaining({ questionNumber: "1", questionText: "수정된 첫 문제", section: "대수", questionType: "essay", conditions: ["x > 0"], equations: ["x + 1 = 2"], points: 4, needsReview: true, warning: "확인 필요", source: { title: "시험지", page: 2 }, figureIds: ["figure-1"] }),
      expect.objectContaining({ questionNumber: "2", questionText: "둘째 문제", points: 2 }),
    ]);
    expect(result.question).toContain("수정된 첫 문제");
    expect(result.question).toContain("2. 둘째 문제");
    expect(result.questionContentSegments).toEqual({
      "1": [{ id: "segment-1", type: "text", text: "수정된 첫 문제" }],
      "2": [{ id: "segment-2", type: "text", text: "둘째 문제" }],
    });
  });
});
