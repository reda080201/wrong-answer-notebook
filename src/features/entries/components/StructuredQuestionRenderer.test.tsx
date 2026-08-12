import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SheetFigureItem } from "../../../types";
import type { ResolvedEntryQuestion } from "../../../utils/entryQuestions";
import StructuredQuestionRenderer from "./StructuredQuestionRenderer";

function question(contentSegments: NonNullable<ResolvedEntryQuestion["contentSegments"]>): ResolvedEntryQuestion {
  return { questionNumber: "7", position: 1, questionText: "호환 본문", conditions: [], equations: [], choices: [], contentSegments, figureIds: [] };
}

describe("StructuredQuestionRenderer", () => {
  it("renders structured segments in canonical order with math and semantic tables", () => {
    const { container } = render(<StructuredQuestionRenderer question={question([
      { id: "text", type: "text", text: "앞 $x$" },
      { id: "condition", type: "condition", label: "조건 A", text: "x > 0" },
      { id: "equation", type: "equation", latex: "x^2 + 1", display: true },
      { id: "table", type: "table", rows: [["x", "$x^2$"], ["1", "2"]] },
    ])} />);

    expect([...container.querySelectorAll("[data-segment-id]")].map((item) => item.getAttribute("data-segment-id"))).toEqual(["text", "condition", "equation", "table"]);
    expect(screen.getByText("조건 A")).toBeInTheDocument();
    expect(container.querySelector(".structured-question-equation--display .katex")).toBeInTheDocument();
    expect(container.querySelectorAll("table td")).toHaveLength(4);
    expect(container.querySelector("table .katex")).toBeInTheDocument();
  });

  it("keeps invalid direct equations readable and places resolved figures at their segment", () => {
    const figure: SheetFigureItem = { id: "fig-1", questionNumber: "7", title: "도형", caption: "설명", source: "described_only" };
    const { container } = render(<StructuredQuestionRenderer
      question={question([
        { id: "before", type: "text", text: "앞" },
        { id: "figure", type: "figure", figureId: "fig-1" },
        { id: "after", type: "equation", latex: "\\notacommand{", display: false },
      ])}
      entry={{ figures: [figure] }}
    />);

    expect([...container.querySelectorAll("[data-segment-id]")].map((item) => item.getAttribute("data-segment-id"))).toEqual(["before", "figure", "after"]);
    expect(screen.getByText("설명")).toBeInTheDocument();
    expect(screen.getByText("\\notacommand{")).toBeInTheDocument();
  });
});
