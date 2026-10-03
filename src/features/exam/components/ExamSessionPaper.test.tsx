import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExamSession } from "../../../types";
import ExamSessionView from "./ExamSessionView";
import RealExamSessionView from "./RealExamSessionView";
import ExamSessionPaper from "./ExamSessionPaper";

vi.mock("../../../api", () => ({ getImageUrl: vi.fn(async (filename: string) => `blob:${filename}`) }));

class TestResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) { this.callback([{ target, contentRect: { width: 300, height: 400 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
  disconnect() {}
  unobserve() {}
}
vi.stubGlobal("ResizeObserver", TestResizeObserver);
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });

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
  it("starts a real session in text mode when legacy source pages have no question mapping", () => {
    const legacyRealSession: ExamSession = {
      ...session,
      mode: "real",
      sourcePageImages: ["unmapped-page-1.png", "unmapped-page-2.png"],
      sourcePageQuestionMap: {},
    };
    const { container } = render(<ExamSessionPaper
      session={legacyRealSession}
      disabled={false}
      onNavigate={vi.fn()}
      onResponse={vi.fn()}
      preferences={{ showScratchNote: true, showOriginalPages: true, showNavigator: true, autoAdvanceOnAnswer: false, warnUnansweredOnSubmit: true, showTimer: true, showMcpHelp: false, paperNavigation: "vertical-pages" }}
    />);

    expect(container.querySelector(".exam-source-view-switch__modes button[aria-pressed='true']")?.textContent).toContain("문항 텍스트");
  });

  it("reinitializes the page/text view when the mounted paper receives another session", async () => {
    const linkedReal = { ...session, id: "real-a", mode: "real" as const, sourcePageImages: ["page.png"], sourcePageQuestionMap: { "page.png": ["1"] }, selectedSourcePageImages: ["page.png"] };
    const props = { disabled: false, onNavigate: vi.fn(), onResponse: vi.fn() };
    const { container, rerender } = render(<ExamSessionPaper {...props} session={linkedReal} />);
    expect(container.querySelector(".exam-source-view-switch__modes button[aria-pressed='true']")?.textContent).toContain("원본 문제지");
    const unlinkedReal = { ...linkedReal, id: "real-b", selectedSourcePageImages: undefined };
    await act(async () => rerender(<ExamSessionPaper {...props} session={unlinkedReal} />));
    expect(container.querySelector(".exam-source-view-switch__modes button[aria-pressed='true']")?.textContent).toContain("문항 텍스트");
    await act(async () => rerender(<ExamSessionPaper {...props} session={{ ...session, id: "practice-c", mode: "practice", sourcePageImages: ["page.png"] }} />));
    expect(container.querySelector(".exam-source-view-switch__modes button[aria-pressed='true']")?.textContent).toContain("원본 문제지");
  });

  it("keeps the current question on another linked page when its current page is deselected", async () => {
    const linkedSession: ExamSession = {
      ...session,
      mode: "real",
      sourcePageImages: ["q1-page-a.png", "q1-page-b.png", "q2-page.png"],
      sourcePageQuestionMap: { "q1-page-a.png": ["1"], "q1-page-b.png": ["1"], "q2-page.png": ["2"] },
      selectedSourcePageImages: ["q1-page-a.png", "q1-page-b.png", "q2-page.png"],
      currentSourcePageImage: "q1-page-a.png",
    };
    const onSessionChange = vi.fn();
    const props = { session: linkedSession, disabled: false, onNavigate: vi.fn(), onResponse: vi.fn(), onSessionChange };
    const { rerender } = render(<ExamSessionPaper {...props} preferences={{ showScratchNote: true, showOriginalPages: true, showNavigator: true, autoAdvanceOnAnswer: false, warnUnansweredOnSubmit: true, showTimer: true, showMcpHelp: false, paperNavigation: "vertical-pages" }} />);
    fireEvent.click(screen.getByText("문제 페이지 선택"));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    const recipe = onSessionChange.mock.lastCall?.[0] as (value: ExamSession) => ExamSession;
    const updated = recipe(linkedSession);
    expect(updated.currentSourcePageImage).toBe("q1-page-b.png");
    rerender(<ExamSessionPaper {...props} session={updated} />);
    expect(await screen.findByAltText("원본 문제지 페이지 2")).toBeVisible();
  });

  it("switches to text and does not fall back to another question page when all current links are deselected", () => {
    const linkedSession: ExamSession = {
      ...session,
      mode: "real",
      sourcePageImages: ["q1-page.png", "q2-page.png"],
      sourcePageQuestionMap: { "q1-page.png": ["1"], "q2-page.png": ["2"] },
      selectedSourcePageImages: ["q1-page.png", "q2-page.png"],
      currentSourcePageImage: "q1-page.png",
    };
    const onSessionChange = vi.fn();
    const props = { session: linkedSession, disabled: false, onNavigate: vi.fn(), onResponse: vi.fn(), onSessionChange };
    const preferences = { showScratchNote: true, showOriginalPages: true, showNavigator: true, autoAdvanceOnAnswer: false, warnUnansweredOnSubmit: true, showTimer: true, showMcpHelp: false, paperNavigation: "vertical-pages" as const };
    const { unmount } = render(<ExamSessionPaper {...props} preferences={preferences} />);
    fireEvent.click(screen.getByText("문제 페이지 선택"));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    const recipe = onSessionChange.mock.lastCall?.[0] as (value: ExamSession) => ExamSession;
    const updated = recipe(linkedSession);
    expect(updated.currentSourcePageImage).toBeUndefined();
    unmount();
    render(<ExamSessionPaper {...props} session={updated} preferences={preferences} />);
    expect(screen.getByText("문항 텍스트").closest("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByAltText("원본 문제지 페이지 2")).not.toBeInTheDocument();
  });

  it("lets the user turn to a different question's page from the no-linked-page state", () => {
    const linkedSession: ExamSession = {
      ...session,
      entryId: "generated:manual-check",
      mode: "real",
      currentQuestionIndex: 1,
      sourcePageImages: ["q1-page.png", "q2-page.png"],
      sourcePageQuestionMap: { "q1-page.png": ["1"] },
      selectedSourcePageImages: ["q1-page.png"],
      questions: session.questions.slice(0, 2).map((question, index) => ({
        ...question,
        sourcePageImages: [index === 0 ? "q1-page.png" : "q2-page.png"],
        source: { page: 1 },
      })),
    };
    const onNavigate = vi.fn();
    render(<ExamSessionPaper session={linkedSession} disabled={false} onNavigate={onNavigate} onResponse={vi.fn()} preferences={{ showScratchNote: true, showOriginalPages: true, showNavigator: true, autoAdvanceOnAnswer: false, warnUnansweredOnSubmit: true, showTimer: true, showMcpHelp: false, paperNavigation: "vertical-pages" }} />);
    fireEvent.click(screen.getByText("원본 문제지").closest("button")!);

    expect(screen.getByText("현재 문항의 연결 페이지 없음")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(onNavigate).toHaveBeenCalledWith(0);
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
