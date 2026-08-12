import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImportReviewWorkspace from "./ImportReviewWorkspace";
import type { StructuredQuestion } from "../../../types";

function question(questionNumber: string, needsReview = false): StructuredQuestion {
  return {
    questionNumber,
    questionText: `본문 ${questionNumber}`,
    conditions: [],
    equations: [],
    choices: [],
    contentSegments: [],
    figureIds: [],
    needsReview,
  };
}

describe("ImportReviewWorkspace", () => {
  it("renders summary, navigator, scrollable body, and fixed footer slots", async () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    render(
      <ImportReviewWorkspace
        open
        title="문제지 검수"
        onClose={onClose}
        summary={<strong>30문항 검수</strong>}
        status="확인 필요 2개"
        questionNavigator={<button type="button">22번</button>}
        footer={<button type="button">바로 저장</button>}
      >
        <p>본문 검수 영역</p>
      </ImportReviewWorkspace>,
    );

    expect(screen.getByRole("dialog", { name: "문제지 검수" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "가져오기 검수 본문" })).toHaveClass("import-review-workspace-body");
    expect(screen.getByText("30문항 검수")).toBeInTheDocument();
    expect(screen.getByText("확인 필요 2개")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "22번" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "바로 저장" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    opener.remove();
  });

  it("keeps the optional sidebar slot available without a navigator", () => {
    render(
      <ImportReviewWorkspace open title="도구 검수" onClose={vi.fn()} sidebar={<p>검수 도구</p>}>
        <p>본문</p>
      </ImportReviewWorkspace>,
    );

    expect(screen.getByRole("region", { name: "검수 도구" })).toHaveTextContent("검수 도구");
  });

  it("shows one active structured question and exposes navigation state", () => {
    const onActiveQuestionChange = vi.fn();
    const questions = [question("1"), question("2", true), question("3")];

    render(
      <ImportReviewWorkspace
        open
        title="문항 검수"
        onClose={vi.fn()}
        structuredQuestions={questions}
        defaultActiveQuestionIndex={1}
        onActiveQuestionChange={onActiveQuestionChange}
        renderQuestion={({ question: current }) => <p>{current.questionText}</p>}
        sourcePane={({ question: current }) => <p>원본 {current.questionNumber}</p>}
        warnings={({ question: current }) => current.needsReview ? <p role="alert">검토 필요</p> : null}
      />,
    );

    expect(screen.getByText("본문 2")).toBeInTheDocument();
    expect(screen.queryByText("본문 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2번 문항, 검토 필요" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("alert")).toHaveTextContent("검토 필요");
    expect(screen.getByText("원본 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "3번 문항" }));
    expect(onActiveQuestionChange).toHaveBeenCalledWith(2);
  });

  it("supports previous and next footer actions in uncontrolled mode", () => {
    render(
      <ImportReviewWorkspace
        open
        title="문항 검수"
        onClose={vi.fn()}
        structuredQuestions={[question("1"), question("2")]}
        renderQuestion={({ question: current }) => <p>{current.questionText}</p>}
      />,
    );

    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("본문 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전" })).toBeEnabled();
  });
});
