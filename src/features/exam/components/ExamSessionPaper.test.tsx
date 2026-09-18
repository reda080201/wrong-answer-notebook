import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExamSession } from "../../../types";
import ExamSessionView from "./ExamSessionView";
import RealExamSessionView from "./RealExamSessionView";
import ExamSessionPaper from "./ExamSessionPaper";

const session: ExamSession = {
  id: "paper-session", entryId: "sheet", title: "수학 모의고사", subject: "수학",
  status: "in_progress", currentQuestionIndex: 0, responses: [],
  startedAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  questions: [
    { id: "q1", questionNumber: "1", question: "첫 문항", questionType: "multiple_choice", choices: ["① 1", "② 2"], questionImages: [], figures: [] },
    { id: "q2", questionNumber: "2", question: "둘째 문항", questionType: "short_answer", choices: [], questionImages: [], figures: [] },
    { id: "q3", questionNumber: "3", question: "셋째 문항", questionType: "essay", choices: [], questionImages: [], figures: [] },
  ],
};
describe("shared exam paper interactions", () => {
  it.each(["practice", "real"])("%s keeps answer, mark and navigation from rapid interactions", mode => {
    const onChange = vi.fn();
    render(mode === "practice"
      ? <ExamSessionView session={session} onChange={onChange} onSubmit={vi.fn()} />
      : <RealExamSessionView session={{ ...session, answerSheetOpen: false }} onChange={onChange} onSubmit={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(within(screen.getByRole("group", { name: "1번 선택지" })).getByRole("button", { name: "① 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "1번 검토 표시" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    const latest = onChange.mock.lastCall?.[0] as ExamSession;
    expect(latest.responses).toHaveLength(1);
    expect(latest.responses[0]).toMatchObject({ questionNumber: "1", response: "①", markedForReview: true });
    expect(latest.currentQuestionIndex).toBe(1);
  });
  it("targets the editor's question identity rather than whichever question was current", () => {
    const onChange = vi.fn();
    render(<ExamSessionView session={session} onChange={onChange} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("3번 답안"), { target: { value: "서술 답안" } });
    expect(onChange.mock.lastCall?.[0]).toMatchObject({
      currentQuestionIndex: 2,
      responses: [expect.objectContaining({ questionNumber: "3", response: "서술 답안" })],
    });
  });
  it("retains response and current identity across navigation mode changes", () => {
    const answered = { ...session, currentQuestionIndex: 1, responses: [{ questionNumber: "2", response: "42", scratchNote: "메모", markedForReview: true, updatedAt: session.updatedAt }] };
    const props = { session: answered, disabled: false, onNavigate: vi.fn(), onResponse: vi.fn() };
    const { rerender, container } = render(<ExamSessionPaper {...props} />);
    const before = [...container.querySelectorAll("[data-paper-page]")].map(page => page.textContent);
    rerender(<ExamSessionPaper {...props} preferences={{ showScratchNote: true, showOriginalPages: true, showNavigator: true, autoAdvanceOnAnswer: false, warnUnansweredOnSubmit: true, showTimer: true, showMcpHelp: false, paperNavigation: "horizontal-pages" }} />);
    expect([...container.querySelectorAll("[data-paper-page]")].map(page => page.textContent)).toEqual(before);
    expect(screen.getByLabelText("2번 답안")).toHaveValue("42");
    expect(screen.getByLabelText("2번 검토 표시")).toBeChecked();
    expect(container.querySelector('[data-paper-number="2"]')).toHaveAttribute("aria-current", "step");
    expect(props.onResponse).not.toHaveBeenCalled();
  });

  it("renders a shared passage once per focus spread while keeping it in A4 mode", () => {
    const groupedSession: ExamSession = {
      ...session,
      questions: session.questions.map((question) => ({
        ...question,
        stimulusGroupId: "passage-a",
        passage: "공통 지문",
      })),
    };
    const props = { session: groupedSession, disabled: false, onNavigate: vi.fn(), onResponse: vi.fn() };
    const preferences = {
      showScratchNote: true,
      showOriginalPages: true,
      showNavigator: true,
      autoAdvanceOnAnswer: false,
      warnUnansweredOnSubmit: true,
      showTimer: true,
      showMcpHelp: false,
      paperNavigation: "vertical-pages" as const,
      paperPresentation: "two-question" as const,
    };
    const { container, rerender } = render(<ExamSessionPaper {...props} preferences={preferences} />);

    expect(screen.getByLabelText("집중 보기 1페이지").querySelectorAll(".exam-passage")).toHaveLength(1);

    rerender(<ExamSessionPaper {...props} preferences={{ ...preferences, paperPresentation: "a4" }} />);
    expect(container.querySelectorAll(".exam-passage")).toHaveLength(1);
    expect(screen.getByText("공통 지문")).toBeVisible();
  });
});
