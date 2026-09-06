import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OnboardingTour from "./OnboardingTour";

describe("OnboardingTour", () => {
  it("supports skip, dismissal preference, and its five ordered steps", () => {
    const onDismiss = vi.fn();
    render(<OnboardingTour open onDismiss={onDismiss} />);
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("다시 보지 않기"));
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(onDismiss).toHaveBeenCalledWith(true);
  });

  it("onOpenQuestionBank button in step 0 triggers the callback", () => {
    const onOpenQuestionBank = vi.fn();
    render(<OnboardingTour open onDismiss={vi.fn()} onOpenQuestionBank={onOpenQuestionBank} />);
    // Step 0 shows the action buttons including 문제 은행 둘러보기
    const btn = screen.getByRole("button", { name: "문제 은행 둘러보기" });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onOpenQuestionBank).toHaveBeenCalledTimes(1);
  });
});
