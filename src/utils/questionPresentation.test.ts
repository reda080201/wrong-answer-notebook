import { describe, expect, it } from "vitest";
import { normalizeQuestionPresentationSegments } from "./questionPresentation";

describe("normalizeQuestionPresentationSegments", () => {
  it("keeps canonical order and intentional duplicates while supplementing missing legacy semantics", () => {
    const segments = normalizeQuestionPresentationSegments({
      questionText: "본문",
      conditions: ["(가) x > 0", "추가 조건"],
      equations: ["\\(x+1\\)"],
      contentSegments: [
        { id: "text-1", type: "text", text: "본문" },
        { id: "equation-1", type: "equation", latex: "x+1", display: true },
        { id: "equation-2", type: "equation", latex: "x+1", display: true },
        { id: "figure-1", type: "figure", figureId: "figure-1" },
        { id: "table-1", type: "table", rows: [["표"]] },
        { id: "condition-1", type: "condition", label: "(가)", text: "x > 0" },
      ],
    });

    expect(segments.map((segment) => segment.id)).toEqual([
      "text-1", "equation-1", "equation-2", "figure-1", "table-1", "condition-1", "condition-2",
    ]);
  });
});
