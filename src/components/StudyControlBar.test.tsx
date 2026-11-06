import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import StudyControlBar from "./StudyControlBar";
it("keeps answer reveal separate from grading after repeated clicks on the last question", () => {
  const props: ComponentProps<typeof StudyControlBar> = {
    isSheet: false, isConcept: false, questionIndex: 0, questionCount: 1,
    hideAnswers: true, detailViewMode: "paper", difficult: false, reviewSaving: null,
    compact: false, showModeControls: false, quickMemoOpen: false, quickMemoText: "",
    onPrevious: vi.fn(), onNext: vi.fn(), onToggleAnswers: vi.fn(), onReview: vi.fn(),
    onToggleDifficult: vi.fn(), onModeChange: vi.fn(), onCompactChange: vi.fn(),
    onQuickMemoOpenChange: vi.fn(), onQuickMemoTextChange: vi.fn(), onQuickMemoSubmit: vi.fn(),
  };
  const { rerender } = render(<StudyControlBar {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
  rerender(<StudyControlBar {...props} hideAnswers={false} />);
  fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
  expect(props.onReview).not.toHaveBeenCalled();
  expect(props.onToggleAnswers).toHaveBeenCalledTimes(1);
  rerender(<><StudyControlBar {...props} isSheet questionCount={3} /><StudyControlBar {...props} isSheet questionCount={3} /></>);
  const previous = screen.getAllByRole("button", { name: "하단 이전 문제" });
  const ids = previous.map(button => button.getAttribute("aria-describedby"));
  expect(new Set(ids).size).toBe(2);
  for (const id of ids) expect(document.getElementById(id!)).toHaveTextContent("첫 번째 문항");
  rerender(<StudyControlBar {...props} isSheet questionCount={3} questionIndex={2} />);
  const next = screen.getByRole("button", { name: "하단 다음 문제" });
  expect(next).toBeDisabled();
  expect(document.getElementById(next.getAttribute("aria-describedby")!)).toHaveTextContent("마지막 문항");
});
