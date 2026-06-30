import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../types";
import LearningContentPanel from "./LearningContentPanel";

const baseEntry: WrongAnswerEntry = {
  id: "entry-1",
  subject: "수학",
  title: "함수 오답",
  question: "1. 함수 문제",
  questionImages: [],
  entryKind: "problem_sheet",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  answerKey: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

describe("LearningContentPanel", () => {
  it("renders concepts, strategy, routine, wrong point, review point, memo, and checklist cards", () => {
    render(
      <LearningContentPanel
        entry={{
          ...baseEntry,
          memo: "전체 메모: [[일차함수]] 확인",
          checklist: [{ id: "check-1", text: "조건 표시하기", checked: true }],
          answerKey: [
            {
              id: "answer-1",
              questionNumber: "1",
              answer: "③",
              explanation: "해설",
              strategy: "그래프 교점을 먼저 확인",
              steps: ["조건 정리", "식 세우기"],
              choiceJudgements: [{ marker: "①", text: "조건 불일치" }],
              wrongPoint: "절편과 교점을 혼동",
              reviewPoint: "교점 정의 복습",
              importantPoints: ["보기 비교"],
              concepts: ["함수", "그래프"],
            },
          ],
          mistakeAnalysis: {
            causes: [{ type: "condition_misread", severity: "high", note: "조건을 놓침" }],
            primaryCause: "condition_misread",
          },
        }}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set(["일차함수"])}
      />,
    );

    expect(screen.getByRole("complementary", { name: "학습 내용" })).toBeInTheDocument();
    expect(screen.getByText("핵심 개념")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "함수" })).toBeInTheDocument();
    expect(screen.getByText("그래프 교점을 먼저 확인")).toBeInTheDocument();
    expect(screen.getByText("조건 정리")).toBeInTheDocument();
    expect(screen.getByText("조건 불일치")).toBeInTheDocument();
    expect(screen.getByText("절편과 교점을 혼동")).toBeInTheDocument();
    expect(screen.getByText("교점 정의 복습")).toBeInTheDocument();
    expect(screen.getByText("조건 해석 실패")).toBeInTheDocument();
    expect(screen.getByText("조건 표시하기")).toBeInTheDocument();
  });

  it("renders math through MathText and treats raw html as text", () => {
    const { container } = render(
      <LearningContentPanel
        entry={{
          ...baseEntry,
          answerKey: [
            {
              id: "answer-1",
              questionNumber: "1",
              answer: "",
              explanation: "",
              strategy: "$x^2+1$을 먼저 확인",
              wrongPoint: "<script>alert(1)</script>",
              reviewPoint: "",
              importantPoints: [],
            },
          ],
        }}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    expect(container.querySelector(".math-fragment")).toBeInTheDocument();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).not.toBeInTheDocument();
  });

  it("shows an empty state when there is no learning content", () => {
    render(
      <LearningContentPanel
        entry={baseEntry}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    expect(screen.getByText("학습 내용이 아직 없습니다.")).toBeInTheDocument();
  });
});
