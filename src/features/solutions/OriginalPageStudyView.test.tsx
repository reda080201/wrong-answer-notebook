import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { syntheticLifecycleEntry } from "../../../e2e/fixtures/syntheticLifecycle";
import type { WrongAnswerEntry } from "../../types";
import OriginalPageStudyView from "./OriginalPageStudyView";

vi.mock("../../api", () => ({ getImageUrl: vi.fn(async (filename: string) => `blob:${filename}`) }));

class TestResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) { this.callback([{ target, contentRect: { width: 300, height: 400 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
  disconnect() {}
  unobserve() {}
}
vi.stubGlobal("ResizeObserver", TestResizeObserver);
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });

const pagesEntry = {
  ...syntheticLifecycleEntry,
  sourcePageImages: ["page-1.png", "page-2.png"],
  structuredQuestions: syntheticLifecycleEntry.structuredQuestions.slice(0, 3).map((question, index) => ({
    ...question,
    source: { page: index === 0 ? 1 : 2 },
  })),
} as unknown as WrongAnswerEntry;

const questionKey = (number: string) => JSON.stringify([number, ""]);

describe("OriginalPageStudyView question and page synchronization", () => {
  it("moves to a question's selected linked page and preserves the question when a page has several links", async () => {
    const onCurrentQuestionChange = vi.fn();
    const { rerender } = render(<OriginalPageStudyView entry={pagesEntry} hidden={false} currentQuestionKey={questionKey("1")} onCurrentQuestionChange={onCurrentQuestionChange} />);
    await screen.findByAltText("원본 문제지 페이지 1");
    fireEvent.change(screen.getByLabelText("학습할 현재 문항"), { target: { value: questionKey("2") } });
    expect(onCurrentQuestionChange).toHaveBeenCalledWith(questionKey("2"));
    rerender(<OriginalPageStudyView entry={pagesEntry} hidden={false} currentQuestionKey={questionKey("2")} onCurrentQuestionChange={onCurrentQuestionChange} />);
    await screen.findByText("2 / 2 페이지");
    rerender(<OriginalPageStudyView entry={pagesEntry} hidden={false} currentQuestionKey={questionKey("1")} onCurrentQuestionChange={onCurrentQuestionChange} />);
    await screen.findByText("1 / 2 페이지");
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(screen.getByLabelText("학습할 현재 문항")).toHaveValue(questionKey("1"));
    expect(screen.getByText(/여러 문항/)).toBeInTheDocument();
  });

  it("keeps the current question when its page is deselected and uses the next selected page", async () => {
    render(<OriginalPageStudyView entry={pagesEntry} hidden={false} currentQuestionKey={questionKey("1")} />);
    await screen.findByAltText("원본 문제지 페이지 1");
    fireEvent.click(screen.getByText(/문제 페이지 선택/));
    fireEvent.click(screen.getByLabelText("페이지 1"));
    expect(screen.getByLabelText("학습할 현재 문항")).toHaveValue(questionKey("1"));
    expect(screen.getByText("1 / 1 페이지")).toBeInTheDocument();
    expect(screen.getByText(/문항 선택은 유지됩니다/)).toBeInTheDocument();
  });
});
