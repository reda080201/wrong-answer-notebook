import { describe, expect, it } from "vitest";
import {
  draftContentSegments,
  questionDraftToEntryData,
  type ImportDraftGroup,
  type ImportQuestionDraft,
  updateDraftContentSegment,
} from "./importWorkspace";
import { validateImportWorkspace } from "../services/validateImportWorkspace";

function draft(overrides: Partial<ImportQuestionDraft> = {}): ImportQuestionDraft {
  return {
    id: "question-1",
    groupId: "group-1",
    order: 0,
    displayQuestionNumber: "1",
    sourceQuestionNumber: "1",
    contentSegments: [{ id: "text-a", type: "text" as const, text: "앞부분" }, { id: "figure-f", type: "figure" as const, figureId: "figure-f" }, { id: "table-t", type: "table" as const, rows: [["표"]] }, { id: "text-b", type: "text" as const, text: "뒷부분" }],
    choices: [],
    figures: [],
    questionImageAssets: [],
    sourcePageAssets: [],
    explanationParts: [],
    sourceReferences: [],
    status: "ready" as const,
    warnings: [],
    ...overrides,
  };
}

function group(question = draft()): ImportDraftGroup {
  return { id: "group-1", title: "1회", questions: [question], answerItems: [], sourceFileIds: [], userConfirmed: true };
}

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
      "1": [
        { id: "segment-1", type: "text", text: "수정된 첫 문제" },
        { id: "legacy-question-1-condition-2", type: "condition", text: "x > 0" },
        { id: "legacy-question-1-equation-3", type: "equation", latex: "x + 1 = 2", display: true },
      ],
      "2": [{ id: "segment-2", type: "text", text: "둘째 문제" }],
    });
  });

  it("updates one text segment without collapsing later text or anchors", () => {
    const edited = updateDraftContentSegment(draft(), "text-a", "수정된 앞부분");
    const result = questionDraftToEntryData(group(edited));
    expect(result.structuredQuestions?.[0].contentSegments).toEqual([
      { id: "text-a", type: "text", text: "수정된 앞부분" },
      { id: "figure-f", type: "figure", figureId: "figure-f" },
      { id: "table-t", type: "table", rows: [["표"]] },
      { id: "text-b", type: "text", text: "뒷부분" },
    ]);
    expect(result.structuredQuestions?.[0].questionText).toBe("수정된 앞부분\n뒷부분");
  });

  it("edits condition and equation segments in place", () => {
    const question = draft({
      contentSegments: [
        { id: "text-a", type: "text", text: "본문" },
        { id: "condition-a", type: "condition", text: "x > 0" },
        { id: "figure-f", type: "figure", figureId: "figure-f" },
        { id: "equation-a", type: "equation", latex: "x = 1", display: true },
        { id: "text-b", type: "text", text: "후속 본문" },
      ],
      conditions: ["x > 0"],
      equations: ["x = 1"],
    });
    const edited = updateDraftContentSegment(updateDraftContentSegment(question, "condition-a", "x >= 0"), "equation-a", "x = 2");
    const result = questionDraftToEntryData(group(edited));
    expect(result.structuredQuestions?.[0]).toEqual(expect.objectContaining({ conditions: ["x >= 0"], equations: ["x = 2"] }));
    expect(result.structuredQuestions?.[0].contentSegments?.map((segment) => segment.id)).toEqual(["text-a", "condition-a", "figure-f", "equation-a", "text-b"]);
  });

  it("handles legacy sourceText only for safe one-segment or identical joins", () => {
    expect(draftContentSegments({ ...draft({ contentSegments: [{ id: "text-a", type: "text", text: "old" }] }), sourceText: "new" })).toEqual([{ id: "text-a", type: "text", text: "new" }]);
    expect(draftContentSegments({ ...draft(), sourceText: "앞부분\n뒷부분" })).toHaveLength(4);
    expect(() => draftContentSegments({ ...draft(), sourceText: "전체가 합쳐진 다른 본문" })).toThrow("여러 text segment");
  });

  it("blocks ambiguous legacy sourceText before entry conversion", () => {
    const question = draft({ sourceText: "전체가 합쳐진 다른 본문" });
    const workspace = { id: "workspace-1", createdAt: "now", updatedAt: "now", status: "review_required" as const, sourceFiles: [], assets: [], groups: [group(question)], unassignedBlocks: [], excludedBlocks: [], warnings: [], revision: 0 };
    expect(validateImportWorkspace(workspace).some((warning) => warning.severity === "error" && warning.message.includes("여러 text segment"))).toBe(true);
    expect(() => questionDraftToEntryData(workspace.groups[0])).toThrow("여러 text segment");
  });
});
