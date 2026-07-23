import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExamSession } from "../../../types";
import ExamSessionView, { parseChoice } from "./ExamSessionView";

function createSession(overrides: Partial<ExamSession> = {}): ExamSession {
  return {
    id: "session-1",
    entryId: "entry-1",
    title: "모의고사 테스트",
    subject: "수학",
    status: "in_progress",
    questions: [
      {
        id: "q1",
        questionNumber: "1",
        question: "다음 중 옳은 것은?",
        choices: ["① 보기 1", "② 보기 2", "③ 보기 3", "④ 보기 4"],
        questionImages: [],
        figures: [],
        correctAnswer: "②",
      },
    ],
    responses: [],
    currentQuestionIndex: 0,
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseChoice", () => {
  it.each([
    ["① 첫 번째", { marker: "①", content: "첫 번째" }],
    ["(1) 선택", { marker: "(1)", content: "선택" }],
    ["2) 답", { marker: "2)", content: "답" }],
    ["A. 보기", { marker: "A.", content: "보기" }],
    ["b) 보기", { marker: "b)", content: "보기" }],
  ])("parses marker from %s", (choice, expected) => {
    expect(parseChoice(choice)).toEqual(expected);
  });

  it("returns empty marker when no marker prefix is present", () => {
    expect(parseChoice("마커 없는 선택지")).toEqual({
      marker: "",
      content: "마커 없는 선택지",
    });
  });
});

describe("ExamSessionView", () => {
  it("renders choice markers and selects a response when a choice is clicked", () => {
    const onChange = vi.fn();
    const session = createSession();

    render(<ExamSessionView session={session} onChange={onChange} onSubmit={vi.fn()} />);

    expect(screen.getByText("①")).toBeInTheDocument();
    expect(screen.getByText("보기 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /②\s*보기 2/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0] as ExamSession;
    expect(updated.responses).toHaveLength(1);
    expect(updated.responses[0]).toMatchObject({
      questionNumber: "1",
      response: "②",
    });
  });

  it("shows submit confirmation modal and can cancel or confirm submission", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const session = createSession({
      responses: [
        {
          questionNumber: "1",
          response: "②",
          scratchNote: "",
          markedForReview: false,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    render(<ExamSessionView session={session} onChange={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "시험 제출" }));

    const dialog = screen.getByRole("dialog", { name: "시험을 제출할까요?" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/전체 1문항/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "계속 풀기" }));
    expect(screen.queryByRole("dialog", { name: "시험을 제출할까요?" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "시험 제출" }));
    const reopenedDialog = screen.getByRole("dialog", { name: "시험을 제출할까요?" });
    fireEvent.click(within(reopenedDialog).getByRole("button", { name: "제출하고 채점" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(session);
    });
    expect(screen.queryByRole("dialog", { name: "시험을 제출할까요?" })).not.toBeInTheDocument();
  });

  it("disables choice buttons after the session is submitted", () => {
    const session = createSession({
      status: "submitted",
      submittedAt: "2026-01-02T00:00:00.000Z",
      responses: [
        {
          questionNumber: "1",
          response: "②",
          scratchNote: "",
          markedForReview: false,
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });

    render(<ExamSessionView session={session} onChange={vi.fn()} onSubmit={vi.fn()} />);

    const choiceButtons = screen.getAllByRole("button", { name: /보기/ });
    expect(choiceButtons).toHaveLength(4);
    choiceButtons.forEach((button) => {
      expect(button).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "시험 제출" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /②\s*보기 2/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the exam settings destination", () => {
    const onOpenSettings = vi.fn();
    render(
      <ExamSessionView
        session={createSession()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    expect(onOpenSettings).toHaveBeenCalledWith("exam");
  });
});
