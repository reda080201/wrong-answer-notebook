import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StructuredQuestion } from "../../../types";
import StructuredQuestionReviewEditor from "./StructuredQuestionReviewEditor";

const question: StructuredQuestion = {
  questionNumber: "1",
  questionText: "앞부분\n뒷부분",
  conditions: ["x > 0"],
  equations: ["\\frac{1}{2}"],
  choices: ["① 1", "② 2"],
  contentSegments: [
    { id: "text-a", type: "text", text: "앞부분" },
    { id: "figure-f", type: "figure", figureId: "figure-1" },
    { id: "text-b", type: "text", text: "뒷부분" },
    { id: "condition-c", type: "condition", text: "x > 0" },
    { id: "table-t", type: "table", rows: [["표"]] },
    { id: "equation-e", type: "equation", latex: "\\frac{1}{2}", display: true },
  ],
  figureIds: ["figure-1"],
};

describe("StructuredQuestionReviewEditor", () => {
  it("edits ordered text segments while preserving figure and table anchors", () => {
    const onChange = vi.fn();
    render(<StructuredQuestionReviewEditor questions={[question]} onChange={onChange} />);

    expect(screen.getByDisplayValue("앞부분")).toBeInTheDocument();
    expect(screen.getByDisplayValue("뒷부분")).toBeInTheDocument();
    expect(screen.getByLabelText("1번 그림 배치")).toHaveTextContent("figure-f");
    expect(screen.getByLabelText("1번 표 배치")).toHaveTextContent("table-t");
    expect(document.body.textContent).not.toContain("@@QUESTION");

    fireEvent.change(screen.getByDisplayValue("앞부분"), { target: { value: "수정된 앞부분" } });

    const next = onChange.mock.calls.at(-1)?.[0] as StructuredQuestion[];
    expect(next[0].contentSegments.map((segment) => segment.id)).toEqual([
      "text-a",
      "figure-f",
      "text-b",
      "condition-c",
      "table-t",
      "equation-e",
    ]);
    expect(next[0].contentSegments[0]).toMatchObject({ id: "text-a", type: "text", text: "수정된 앞부분" });
    expect(next[0].contentSegments[2]).toMatchObject({ id: "text-b", type: "text", text: "뒷부분" });
  });

  it("edits conditions, equations, and choices as human-readable fields", () => {
    const onChange = vi.fn();
    const { rerender } = render(<StructuredQuestionReviewEditor questions={[question]} onChange={onChange} />);

    fireEvent.change(screen.getByDisplayValue("x > 0"), { target: { value: "x >= 0" } });
    const afterCondition = onChange.mock.calls.at(-1)?.[0] as StructuredQuestion[];
    rerender(<StructuredQuestionReviewEditor questions={afterCondition} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue("\\frac{1}{2}"), { target: { value: "x = 1" } });
    const afterEquation = onChange.mock.calls.at(-1)?.[0] as StructuredQuestion[];
    rerender(<StructuredQuestionReviewEditor questions={afterEquation} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue("① 1"), { target: { value: "① 3" } });

    const next = onChange.mock.calls.at(-1)?.[0] as StructuredQuestion[];
    expect(next[0].conditions).toEqual(["x >= 0"]);
    expect(next[0].equations).toEqual(["x = 1"]);
    expect(next[0].choices).toEqual(["① 3", "② 2"]);
  });
});
