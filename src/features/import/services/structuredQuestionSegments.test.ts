import { describe, expect, it } from "vitest";
import type { StructuredQuestion } from "../../../types";
import {
  materializeStructuredReviewSegments,
  projectStructuredSemanticFields,
  updateStructuredQuestionSegment,
} from "./structuredQuestionSegments";

const question: StructuredQuestion = {
  questionNumber: "1",
  questionText: "앞부분\n뒷부분",
  conditions: [],
  equations: [],
  choices: ["① 1"],
  contentSegments: [
    { id: "a", type: "text", text: "앞부분" },
    { id: "f", type: "figure", figureId: "figure-1" },
    { id: "b", type: "text", text: "뒷부분" },
  ],
  figureIds: ["figure-1"],
};

describe("structured question segment editing", () => {
  it("keeps a figure between independently edited text segments", () => {
    const [updated] = updateStructuredQuestionSegment([question], {
      questionNumber: "1",
      segmentId: "a",
      value: "수정된 앞부분",
    });

    expect(updated.contentSegments).toEqual([
      { id: "a", type: "text", text: "수정된 앞부분" },
      { id: "f", type: "figure", figureId: "figure-1" },
      { id: "b", type: "text", text: "뒷부분" },
    ]);
    expect(updated.questionText).toBe("수정된 앞부분\n뒷부분");
  });

  it("keeps table anchors and projects condition/equation fields once", () => {
    const segments = materializeStructuredReviewSegments({
      ...question,
      questionText: "본문",
      conditions: ["x > 0"],
      equations: ["x = 1"],
      contentSegments: [
        { id: "text", type: "text", text: "본문" },
        { id: "table", type: "table", rows: [["표"]] },
      ],
    });
    const semantic = projectStructuredSemanticFields(segments);

    expect(segments.map((segment) => segment.id)).toEqual(["text", "table", "review-1-condition-1", "review-1-equation-2"]);
    expect(semantic).toEqual({ questionText: "본문", conditions: ["x > 0"], equations: ["x = 1"] });
  });
});
