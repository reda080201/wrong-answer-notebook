import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../types";
import EntryDetail from "./EntryDetail";

vi.mock("../api", () => ({
  getImageUrl: vi.fn((filename: string) => Promise.resolve(`mock://${filename}`)),
}));

const sheetEntry: WrongAnswerEntry = {
  id: "sheet-1",
  subject: "국어",
  title: "중간고사",
  question: "1. 첫 문제\n① 답",
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

describe("EntryDetail sheet layout", () => {
  beforeEach(() => {
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("persists the selected two-column sheet layout", () => {
    render(
      <EntryDetail
        entry={sheetEntry}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "2단" }));

    expect(localStorage.getItem("wrong-answer-sheet-layout")).toBe("columns");
  });

  it("loads the saved sheet layout preference", () => {
    localStorage.setItem("wrong-answer-sheet-layout", "columns");

    const { container } = render(
      <EntryDetail
        entry={sheetEntry}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    expect(container.querySelector(".structured-question-text--columns")).toBeInTheDocument();
  });

  it("shows sheet question table of contents and search highlights", () => {
    const { container } = render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          question: "1. 첫 문제\n① 답\n\n2. 둘째 문제\n① 선택",
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("시험지 안에서 검색"), {
      target: { value: "둘째" },
    });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
    expect(screen.getByText("1개")).toBeInTheDocument();
    expect(container.querySelector(".question-search-mark")).toHaveTextContent("둘째");
  });

  it("switches between textbook paper, solution, and analysis modes", () => {
    render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          question: "1. 첫 문제\n① 답",
          answerKey: [
            {
              id: "answer-1",
              questionNumber: "1",
              answer: "③",
              explanation: "조건을 확인한다. 따라서 정답이다.",
              strategy: "그래프 교점을 먼저 본다",
              steps: ["조건 정리", "교점 확인"],
              choiceJudgements: [{ marker: "①", text: "교점 조건 불만족" }],
              wrongPoint: "절편과 교점 혼동",
              reviewPoint: "교점 정의 복습",
              notes: "조건 먼저 보기",
              importantPoints: ["보기 비교"],
              concepts: ["함수"],
            },
          ],
          importAudit: {
            expectedQuestionNumbers: ["1", "2"],
            detectedQuestionNumbers: ["1"],
            missingQuestionNumbers: ["2"],
            uncertainQuestionNumbers: [],
            handwritingExcluded: true,
            needsReviewCount: 1,
          },
          rejectedNotes: ["연필 표시"],
          mistakeAnalysis: {
            causes: [{ type: "condition_misread", severity: "high", note: "조건을 놓침" }],
            primaryCause: "condition_misread",
            preventionNote: "조건에 밑줄",
            practiceMode: "choice_review",
          },
          review: {
            dueAt: "2026-01-03T00:00:00.000Z",
            intervalDays: 3,
            streak: 1,
            history: [],
          },
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set(["함수"])}
      />,
    );

    expect(screen.getByText("교재형 문제지")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "문제지" })).toHaveClass("active");

    fireEvent.click(screen.getByRole("button", { name: "해설지" }));
    expect(screen.getByText("교재형 해설지")).toBeInTheDocument();
    expect(screen.getByText("[해설 1]")).toBeInTheDocument();
    expect(screen.getByText("그래프 교점을 먼저 본다")).toBeInTheDocument();
    expect(screen.getByText("조건 정리")).toBeInTheDocument();
    expect(screen.getByText("교점 조건 불만족")).toBeInTheDocument();
    expect(screen.getByText("절편과 교점 혼동")).toBeInTheDocument();
    expect(screen.getByText("교점 정의 복습")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "답 가리기" }));
    expect(screen.queryByText("조건 정리")).not.toBeInTheDocument();
    expect(screen.queryByText("교점 조건 불만족")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "정답 보이기" }));

    fireEvent.click(screen.getByRole("button", { name: "분석" }));
    expect(screen.getByText("학습 분석")).toBeInTheDocument();
    expect(screen.getByText("누락 문제: 2")).toBeInTheDocument();
    expect(screen.getByText("연필 표시")).toBeInTheDocument();
    expect(screen.getAllByText("조건 해석 실패").length).toBeGreaterThan(0);
    expect(screen.getAllByText("추천 복습: 보기 판단 훈련").length).toBeGreaterThan(0);
  });

  it("shows figure zoom launcher in textbook paper mode", async () => {
    render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          figures: [
            {
              id: "figure-1",
              questionNumber: "1",
              title: "그래프",
              caption: "문제 1 그래프",
              image: "figure-1.png",
              source: "gpt_cleaned",
            },
          ],
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    expect(screen.getByLabelText("문제 삽화 확대 보기")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /확대 보기/ })).toBeInTheDocument();
  });

  it("updates concept checklist items", () => {
    const onChecklistChange = vi.fn();
    render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          id: "concept-1",
          entryKind: "concept",
          title: "함수",
          question: "정의역과 치역",
          checklist: [{ id: "todo-1", text: "정의 암기", checked: false }],
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onChecklistChange={onChecklistChange}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
        allEntries={[]}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "정의 암기 삭제" }));

    expect(onChecklistChange).toHaveBeenCalledWith([
      { id: "todo-1", text: "정의 암기", checked: true },
    ]);
  });

  it("shows sheet answer key and scrolls to linked question", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          question: "31. 첫 문제\n① 답",
          answerKey: [
            {
              id: "answer-1",
              questionNumber: "1",
              answer: "③",
              explanation: "조건을 확인한다.",
              importantPoints: ["보기 비교"],
            },
          ],
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /답안지/ }));
    expect(screen.getByText("③")).toBeInTheDocument();
    expect(screen.getByText("조건을 확인한다.")).toBeInTheDocument();
    expect(screen.getByText("보기 비교")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1번" }));
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("toggles answer and note panels in fullscreen study mode", () => {
    render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          memo: "사진 속 필기 요약",
          answerKey: [
            {
              id: "answer-1",
              questionNumber: "1",
              answer: "③",
              explanation: "조건을 확인한다.",
              importantPoints: ["필수 확인 포인트"],
              needsReview: true,
              sourceNote: "답안지 연결 확인 필요",
            },
          ],
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "집중 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "답지" }));
    expect(screen.getByText("③")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "필기" }));
    expect(screen.getByText("사진 속 필기 요약")).toBeInTheDocument();
    expect(screen.getAllByText("필수 확인 포인트").length).toBeGreaterThan(0);
    expect(screen.getAllByText("답안지 연결 확인 필요").length).toBeGreaterThan(0);
  });

  it("shows one focused question at a time and moves with controls and arrow keys", () => {
    render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          question: "다음 자료를 읽고 답하시오.\n31. 첫 문제\n① 첫 보기\n\n99. 둘째 문제\n① 둘째 보기",
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "집중 보기" }));

    expect(screen.getAllByText("문제 1").length).toBeGreaterThan(0);
    expect(screen.getByText("원문 31")).toBeInTheDocument();
    expect(screen.getByText("다음 자료를 읽고 답하시오.")).toBeInTheDocument();
    expect(screen.getByText("첫 문제")).toBeInTheDocument();
    expect(screen.queryByText("둘째 문제")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getAllByText("문제 2").length).toBeGreaterThan(0);
    expect(screen.getByText("둘째 문제")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getAllByText("문제 1").length).toBeGreaterThan(0);
  });

  it("shows only the current question answer in focused mode", () => {
    render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          question: "31. 첫 문제\n① 첫 보기\n\n99. 둘째 문제\n① 둘째 보기",
          answerKey: [
            {
              id: "answer-1",
              questionNumber: "1",
              answer: "①",
              explanation: "첫 문제 풀이",
              importantPoints: ["첫 포인트"],
            },
            {
              id: "answer-2",
              questionNumber: "99",
              answer: "②",
              explanation: "둘째 문제 풀이",
              importantPoints: ["둘째 포인트"],
            },
          ],
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "집중 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "답지" }));
    expect(screen.getByText("첫 문제 풀이")).toBeInTheDocument();
    expect(screen.queryByText("둘째 문제 풀이")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("둘째 문제 풀이")).toBeInTheDocument();
    expect(screen.queryByText("첫 문제 풀이")).not.toBeInTheDocument();
  });

  it("switches between expanded and mini focused modes", () => {
    render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          question: "1. 첫 문제\n① 첫 보기\n\n2. 둘째 문제\n① 둘째 보기",
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "집중 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "축소" }));

    const mini = screen.getByLabelText("축소된 문제 집중 보기");
    expect(within(mini).getByText("문제 1")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(within(mini).getByText("문제 2")).toBeInTheDocument();

    fireEvent.click(within(mini).getByRole("button", { name: "확대" }));
    expect(screen.getAllByText("문제 2").length).toBeGreaterThan(0);
  });

  it("persists focused text size preference", () => {
    const { container } = render(
      <EntryDetail
        entry={sheetEntry}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "집중 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "글자 +" }));

    expect(localStorage.getItem("wrong-answer-focus-text-size")).toBe("large");
    expect(container.querySelector(".detail-panel--focus-text-large")).toBeInTheDocument();
  });

  it("falls back to question panel when saved answer panel is unavailable", async () => {
    localStorage.setItem("wrong-answer-focus-last-panel", "answer");

    render(
      <EntryDetail
        entry={{ ...sheetEntry, answerKey: [] }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "집중 보기" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "문제" })).toHaveClass("active");
    });
    expect(screen.getByRole("button", { name: "답지" })).toBeDisabled();
  });

  it("falls back to question panel when saved image panel is unavailable", async () => {
    localStorage.setItem("wrong-answer-focus-last-panel", "images");

    render(
      <EntryDetail
        entry={{ ...sheetEntry, questionImages: [] }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "집중 보기" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "문제" })).toHaveClass("active");
    });
    expect(screen.getByRole("button", { name: "이미지" })).toBeDisabled();
  });

  it("enables focused image panel when the current sheet question has a linked figure image", async () => {
    render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          figures: [
            {
              id: "figure-1",
              questionNumber: "1",
              title: "그래프",
              caption: "문제 1 그래프",
              image: "figure-1.png",
              source: "gpt_cleaned",
            },
          ],
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "집중 보기" }));
    const imageButton = screen.getByRole("button", { name: "이미지" });

    expect(imageButton).not.toBeDisabled();
    fireEvent.click(imageButton);

    expect(imageButton).toHaveClass("active");
    expect(screen.getByText("첨부 이미지")).toBeInTheDocument();
  });

  it("opens focused reading mode for a wrong-answer entry", () => {
    render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          id: "wrong-1",
          entryKind: "wrong_answer",
          title: "방정식 오답",
          question: "x + 1 = 2를 풀어라.",
          myAnswer: "x = 2",
          correctAnswer: "x = 1",
          memo: "이항 실수",
          explanationParts: [{ id: "exp-1", text: "양변에서 1을 뺀다.", images: [] }],
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "집중 보기" }));
    expect(screen.getByText("x + 1 = 2를 풀어라.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "정답" }));
    expect(screen.getByText("x = 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "해설" }));
    expect(screen.getByText("양변에서 1을 뺀다.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "메모" }));
    expect(screen.getByText("이항 실수")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "축소" }));
    const mini = screen.getByLabelText("축소된 문제 집중 보기");
    expect(within(mini).getByText("방정식 오답")).toBeInTheDocument();

    fireEvent.click(within(mini).getByRole("button", { name: "확대" }));
    expect(screen.getByLabelText("오답 집중 보기")).toBeInTheDocument();
  });

  it("persists answer hiding and table view preferences", () => {
    render(
      <EntryDetail
        entry={{
          ...sheetEntry,
          answerKey: [
            {
              id: "answer-1",
              questionNumber: "1",
              answer: "③",
              explanation: "조건을 확인한다.",
              importantPoints: [],
            },
          ],
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /답안지/ }));
    fireEvent.click(screen.getByRole("button", { name: "답 가리기" }));
    fireEvent.click(screen.getByRole("button", { name: "표" }));

    expect(screen.getByRole("button", { name: "정답 보이기" })).toBeInTheDocument();
    expect(localStorage.getItem("wrong-answer-answer-hidden")).toBe("true");
    expect(localStorage.getItem("wrong-answer-answer-view")).toBe("table");
  });

  it("calls markdown and print export actions", () => {
    const onExportMarkdown = vi.fn();
    const onOpenPrint = vi.fn();
    render(
      <EntryDetail
        entry={sheetEntry}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleMastered={vi.fn()}
        onToggleDifficult={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onWikiLinkClick={vi.fn()}
        existingTargets={new Set()}
        onExportMarkdown={onExportMarkdown}
        onOpenPrint={onOpenPrint}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    fireEvent.click(screen.getByRole("button", { name: "PDF 인쇄" }));

    expect(onExportMarkdown).toHaveBeenCalledTimes(1);
    expect(onOpenPrint).toHaveBeenCalledTimes(1);
  });
});
