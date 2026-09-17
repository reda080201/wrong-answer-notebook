import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import QuestionFocusPage from "./QuestionFocusPage";

function item(id: string, groupId?: string) {
  return { id, questionNumber: id, groupId, node: <article>{id}</article> };
}

describe("QuestionFocusPage", () => {
  it("packs ordinary questions in pairs and keeps an odd final question alone", () => {
    render(<QuestionFocusPage items={[item("1"), item("2"), item("3"), item("4"), item("5")]} />);
    expect(screen.getByLabelText("집중 보기 1페이지")).toHaveTextContent("1");
    expect(screen.getByLabelText("집중 보기 1페이지")).toHaveTextContent("2");
    fireEvent.click(screen.getAllByRole("button", { name: "다음" })[0]);
    expect(screen.getByLabelText("집중 보기 2페이지")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "다음" })[0]);
    expect(screen.getByLabelText("집중 보기 3페이지")).toHaveTextContent("5");
    expect(screen.getByLabelText("집중 보기 3페이지")).not.toHaveTextContent("4");
  });

  it("preserves a contiguous stimulus group as one focus page", () => {
    render(<QuestionFocusPage items={[item("1"), item("2", "stimulus"), item("3", "stimulus"), item("4")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "다음" })[0]);
    expect(screen.getByLabelText("집중 보기 2페이지")).toHaveTextContent("2");
    expect(screen.getByLabelText("집중 보기 2페이지")).toHaveTextContent("3");
  });

  it("moves with arrows but ignores interactive descendants", () => {
    const onQuestionChange = vi.fn();
    render(<QuestionFocusPage items={[{ ...item("1"), node: <button type="button">답</button> }, item("2"), item("3")]} onNavigateQuestion={onQuestionChange} />);
    const reader = screen.getByLabelText("집중 보기 1페이지").parentElement!;
    fireEvent.keyDown(reader, { key: "ArrowRight" });
    expect(screen.getByLabelText("집중 보기 2페이지")).toBeVisible();
    fireEvent.keyDown(document.querySelector('[data-focus-number="1"] button')!, { key: "ArrowLeft" });
    expect(screen.getByLabelText("집중 보기 2페이지")).toBeVisible();
    expect(onQuestionChange).toHaveBeenCalled();
  });

  it("makes the reader keyboard reachable and gives focus navigation ownership", () => {
    const onQuestionChange = vi.fn();
    render(<QuestionFocusPage items={[item("1"), item("2"), item("3"), item("4")]} onNavigateQuestion={onQuestionChange} />);
    const reader = screen.getByLabelText("2문항 집중 보기");
    expect(reader).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(reader, { key: "ArrowRight" });
    expect(screen.getByLabelText("집중 보기 2페이지")).toBeVisible();
    expect(onQuestionChange).toHaveBeenCalledWith("3");
    expect(screen.getAllByLabelText(/집중 보기 .* 페이지 이동/)).toHaveLength(2);
  });

  it("renders one shared stimulus per spread, including repeated group chunks", () => {
    const stimulus = <div data-testid="shared-stimulus">공통 지문</div>;
    render(<QuestionFocusPage items={[{ ...item("1", "group"), stimulusNode: stimulus }, item("2", "group"), item("3", "group"), item("4", "group"), item("5")]} />);
    expect(screen.getByLabelText("집중 보기 1페이지").querySelectorAll("[data-testid=shared-stimulus]")).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "다음" })[0]);
    expect(screen.getByLabelText("집중 보기 2페이지").querySelectorAll("[data-testid=shared-stimulus]")).toHaveLength(1);
  });
});
