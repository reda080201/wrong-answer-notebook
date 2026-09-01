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
});
