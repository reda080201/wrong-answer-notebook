import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ExamPaperCompositor, { type ExamPaperItem } from "./ExamPaperCompositor";

const originalRect = HTMLElement.prototype.getBoundingClientRect;

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});

function item(id: string): ExamPaperItem {
  return { id, node: <article>{id}</article> };
}

describe("ExamPaperCompositor", () => {
  it("packs measured items into visible A4 page surfaces instead of fixed item slices", () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      const height = this.textContent === "one" || this.textContent === "two" ? 620 : 180;
      return { width: 600, height, top: 0, left: 0, right: 600, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    render(<ExamPaperCompositor enabled layout="single" items={[item("one"), item("two"), item("three")]} />);

    expect(screen.getAllByLabelText(/시험지 .*페이지/)).toHaveLength(2);
    expect(screen.getByLabelText("시험지 1페이지")).toHaveTextContent("one");
    expect(screen.getByLabelText("시험지 2페이지")).toHaveTextContent("two");
  });

  it("keeps consecutive shared-passage items together when a new page is needed", () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      const height = this.textContent === "intro" ? 500 : 340;
      return { width: 600, height, top: 0, left: 0, right: 600, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    render(<ExamPaperCompositor enabled items={[
      item("intro"),
      { ...item("passage-question-1"), groupId: "passage-a" },
      { ...item("passage-question-2"), groupId: "passage-a" },
    ]} />);

    expect(screen.getByLabelText("시험지 2페이지")).toHaveTextContent("passage-question-1");
    expect(screen.getByLabelText("시험지 2페이지")).toHaveTextContent("passage-question-2");
  });

  it("removes canonical target IDs from the hidden measurement tree", () => {
    render(<ExamPaperCompositor enabled items={[{ id: "q9", node: <article id="sheet-question-canonical-9">9번</article> }]} />);
    expect(document.querySelectorAll("#sheet-question-canonical-9")).toHaveLength(1);
  });
});
