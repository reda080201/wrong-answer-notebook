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

  it("renders canonical choices once after the ordered content stream", () => {
    const { container } = render(<StructuredQuestionRenderer question={{ ...question([{ id: "text", type: "text", text: "옳은 것은?" }]), choices: ["① A", "② B", "③ C", "④ D", "⑤ E"] }} />);
    expect(container.querySelectorAll(".structured-question-choices li")).toHaveLength(5);
    expect(container.querySelector(".structured-question-choices")).toHaveTextContent("①");
    expect(container.textContent).toContain("⑤E");
  });

  it("does not add a choice container for subjective questions", () => {
    const { container } = render(<StructuredQuestionRenderer question={question([{ id: "text", type: "text", text: "설명하시오." }])} />);
    expect(container.querySelector(".structured-question-choices")).not.toBeInTheDocument();
  });

  it("deduplicates only standalone choice lines from the content stream", () => {
    const { container } = render(<StructuredQuestionRenderer question={{ ...question([{ id: "text", type: "text", text: "옳은 것은?\n① A\n② B" }]), choices: ["① A", "② B", "③ C"] }} />);
    expect(container.querySelectorAll(".structured-question-choices li")).toHaveLength(1);
    expect(container.querySelector(".structured-question-choices")).toHaveTextContent("③C");
    expect(container.textContent?.match(/①/g)).toHaveLength(1);
    expect(container.textContent?.match(/②/g)).toHaveLength(1);
  });
});
