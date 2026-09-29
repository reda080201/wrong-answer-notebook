import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getImageUrl } from "../api";
import type { SheetFigureItem } from "../types";
import InlineQuestionText from "./InlineQuestionText";
import QuestionContentView from "./QuestionContentView";

vi.mock("../api", () => ({ getImageUrl: vi.fn(async (filename: string) => `blob:${filename}`) }));

const figure = { id: "graph", title: "그래프", caption: "", image: "graph.png", source: "original" } as SheetFigureItem;

describe("InlineQuestionText", () => {
  it("renders a resolved figure at every marker and hides the internal token", async () => {
    render(<p><InlineQuestionText text="앞 [FIGURE:graph] 중간 [FIGURE:graph] 뒤" figures={[figure]} /></p>);
    expect(await screen.findAllByRole("img", { name: "그래프" })).toHaveLength(2);
    expect(screen.getByText("앞", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("[FIGURE:graph]", { exact: false })).not.toBeInTheDocument();
    expect(getImageUrl).toHaveBeenCalledTimes(2);
  });

  it("shows a review placeholder for an unresolved or empty figure ID", () => {
    render(<InlineQuestionText text="[FIGURE:missing] 그리고 [FIGURE:] 그리고 [FIGURE" />);
    expect(screen.getByText("[그림 연결 확인 필요: missing]")).toBeInTheDocument();
    expect(screen.getAllByText("[그림 ID 확인 필요]")).toHaveLength(2);
    expect(screen.queryByText("[FIGURE:missing]", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText("[FIGURE", { exact: false })).not.toBeInTheDocument();
  });

  it("does not append another copy of figures already placed inline in a question", async () => {
    const { container } = render(<QuestionContentView text="앞 [FIGURE:graph] 뒤 [FIGURE:graph]" figures={[figure]} />);
    expect(await screen.findAllByRole("img", { name: "그래프" })).toHaveLength(2);
    expect(container.querySelectorAll(".question-source-figure")).toHaveLength(0);
  });
});
