import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Annotation } from "../types";
import AnnotatableQuestion from "./AnnotatableQuestion";

vi.mock("../api", () => ({
  getImageUrl: vi.fn(),
}));

describe("AnnotatableQuestion", () => {
  it("renders structured question numbers and choices", () => {
    render(
      <AnnotatableQuestion
        question={"1. 다음 설명으로 알맞은 것은?\n① 첫째\n② 둘째"}
        questionImages={[]}
        annotations={[]}
        memoMode={false}
        activeTool="highlight"
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
        sheetLayout="single"
      />,
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("다음 설명으로 알맞은 것은?")).toBeInTheDocument();
    expect(screen.getByText("①")).toBeInTheDocument();
    expect(screen.getByText("첫째")).toBeInTheDocument();
  });

  it("keeps wiki links clickable inside structured text", () => {
    const onWikiLinkClick = vi.fn();

    render(
      <AnnotatableQuestion
        question={"1. [[Algebra|대수]] 개념을 고르시오"}
        questionImages={[]}
        annotations={[]}
        memoMode={false}
        activeTool="highlight"
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={onWikiLinkClick}
        existingTargets={new Set(["algebra"])}
        sheetLayout="single"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "대수" }));

    expect(onWikiLinkClick).toHaveBeenCalledWith("Algebra");
  });

  it("renders existing text annotations on structured segments", () => {
    const question = "1. 핵심 개념을 고르시오";
    const start = question.indexOf("핵심");
    const annotations: Annotation[] = [
      {
        id: "ann-1",
        target: "question",
        kind: "text",
        start,
        end: start + "핵심".length,
        tool: "highlight",
      },
    ];

    const { container } = render(
      <AnnotatableQuestion
        question={question}
        questionImages={[]}
        annotations={annotations}
        memoMode={false}
        activeTool="highlight"
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
        sheetLayout="single"
      />,
    );

    expect(container.querySelector("mark.ann-highlight")).toHaveTextContent("핵심");
  });

  it("shows sequential display numbers with source number as secondary text", () => {
    render(
      <AnnotatableQuestion
        question={"31. 원문 번호가 큰 문제\n① 첫째"}
        questionImages={[]}
        annotations={[]}
        memoMode={false}
        activeTool="highlight"
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
        sheetLayout="single"
      />,
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("원문 31")).toBeInTheDocument();
  });

  it("renders markdown tables inside question text", () => {
    render(
      <AnnotatableQuestion
        question={"1. 표를 해석하시오\n| 구분 | 값 |\n| --- | --- |\n| A | 10 |"}
        questionImages={[]}
        annotations={[]}
        memoMode={false}
        activeTool="highlight"
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
        sheetLayout="single"
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "구분" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "10" })).toBeInTheDocument();
  });

  it("wraps condition and view lines without losing structured text", () => {
    const { container } = render(
      <AnnotatableQuestion
        question={"1. 조건: $x > 0$\n<보기>\nㄱ. 자료 A는 양수이다\nㄴ. 자료 B는 음수이다\n① ㄱ\n② ㄱ, ㄴ"}
        questionImages={[]}
        annotations={[]}
        memoMode={false}
        activeTool="highlight"
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
        sheetLayout="single"
      />,
    );

    expect(container.querySelector(".question-body-segment--condition")).toHaveTextContent("조건:");
    expect(container.querySelector(".question-body-segment--condition .math-fragment")).toBeInTheDocument();
    expect(container.querySelector(".question-body-segment--view")).toHaveTextContent("ㄱ. 자료 A는 양수이다");
    expect(container.querySelector(".question-body-segment--view")).toHaveTextContent("ㄴ. 자료 B는 음수이다");
    expect(screen.getByText("①")).toBeInTheDocument();
    expect(screen.getByText("②")).toBeInTheDocument();
    expect(container.querySelectorAll(".question-choice")).toHaveLength(2);
  });
});
