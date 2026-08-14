import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QuestionTheaterView from "./QuestionTheaterView";
import type { QuestionBlock } from "../utils/textLayout";

const questionBlock: QuestionBlock = {
  kind: "question",
  numberLabel: "7",
  displayNumber: 7,
  body: "다음을 구하시오.",
  bodyStart: 0,
  bodyEnd: 8,
  bodySegments: [{ kind: "body", text: "다음을 구하시오.", start: 0, end: 8 }],
  choices: [],
  start: 0,
  end: 8,
};

function renderTheater(steps = ["조건 정리", "계산"], solutionPresentation: "dialog" | "split" = "split") {
  return render(
    <QuestionTheaterView
      questionBlock={questionBlock}
      questionIndex={0}
      questionCount={1}
      answer={{
        id: "answer-1",
        questionNumber: "7",
        answer: "42",
        explanation: "전체 풀이",
        strategy: "조건을 먼저 정리한다",
        steps,
        choiceJudgements: [{ marker: "①", text: "조건 불일치" }],
        wrongPoint: "계산 실수",
        reviewPoint: "부호 확인",
        importantPoints: [],
      }}
      questionMeta={{ questionNumber: "7", important: true, note: "다시 풀기", updatedAt: "2026-01-01T00:00:00.000Z" }}
      questionImages={[]}
      figures={[]}
      annotations={[]}
      memoMode={false}
      activeTool="highlight"
      hideAnswers={false}
      memo="전체 메모"
      onAnnotationsChange={vi.fn()}
      onWikiLinkClick={vi.fn()}
      existingTargets={new Set()}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      onToggleAnswers={vi.fn()}
      onToggleImportant={vi.fn()}
      onReview={vi.fn()}
      onClose={vi.fn()}
      solutionPresentation={solutionPresentation}
    />,
  );
}

describe("QuestionTheaterView", () => {
  it("opens and closes the split solution layout", () => {
    const { container } = renderTheater();

    expect(container.querySelector(".question-theater-main--split")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "해설 보기" }));

    expect(container.querySelector(".question-theater-main--split")).toBeInTheDocument();
    const solutionPane = screen.getByLabelText("현재 문제 해설");
    expect(solutionPane).toBeInTheDocument();
    expect(within(solutionPane).getByText("정답")).toBeInTheDocument();
    expect(within(solutionPane).getByText("풀이 전략")).toBeInTheDocument();
    expect(within(solutionPane).getByText("단계별 풀이")).toBeInTheDocument();
    expect(within(solutionPane).getByText("보기별 판단")).toBeInTheDocument();
    expect(within(solutionPane).getByText("오답 포인트")).toBeInTheDocument();
    expect(within(solutionPane).getByText("복습 포인트")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "해설 닫기" }));
    expect(container.querySelector(".question-theater-main--split")).not.toBeInTheDocument();
    expect(screen.queryByText("풀이 전략")).not.toBeInTheDocument();
  });

  it("opens solution in a nested dialog when configured", () => {
    renderTheater(undefined, "dialog");
    expect(screen.queryByRole("dialog", { name: "문제 7 해설" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "해설 보기" }));
    expect(screen.getByRole("dialog", { name: "문제 7 해설" })).toHaveTextContent("풀이 전략");
    fireEvent.click(screen.getByRole("button", { name: "문제로 돌아가기" }));
    expect(screen.queryByRole("dialog", { name: "문제 7 해설" })).not.toBeInTheDocument();
  });

  it("renders repeated solution steps without collapsing list items", () => {
    const { container } = renderTheater(["같은 단계", "같은 단계"]);
    fireEvent.click(screen.getByRole("button", { name: "해설 보기" }));
    expect(container.querySelectorAll(".question-theater-solution-content ol li")).toHaveLength(2);
  });
});
