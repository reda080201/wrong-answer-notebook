import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProgressiveQuestionBody from "./ProgressiveQuestionBody";

class MockIntersectionObserver {
  static latest: MockIntersectionObserver | undefined;
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  readonly unobserve = vi.fn();
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.latest = this;
  }

  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

const child = <div data-testid="heavy-question-content">Heavy question content</div>;

describe("ProgressiveQuestionBody", () => {
  beforeEach(() => {
    MockIntersectionObserver.latest = undefined;
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defers content until intersection, then keeps it mounted after leaving the viewport", () => {
    const { container } = render(<ProgressiveQuestionBody eager={false} label="1번 문항">{child}</ProgressiveQuestionBody>);

    expect(screen.queryByTestId("heavy-question-content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "문항 내용 불러오기" })).toBeInTheDocument();
    const observer = MockIntersectionObserver.latest!;
    expect(observer.observe).toHaveBeenCalledWith(container.firstChild);

    act(() => observer.trigger(true));
    expect(screen.getByTestId("heavy-question-content")).toBeInTheDocument();

    act(() => observer.trigger(false));
    expect(screen.getByTestId("heavy-question-content")).toBeInTheDocument();
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("mounts content when the explicit load button is selected", () => {
    render(<ProgressiveQuestionBody eager={false} label="2번 문항">{child}</ProgressiveQuestionBody>);

    fireEvent.click(screen.getByRole("button", { name: "문항 내용 불러오기" }));

    expect(screen.getByTestId("heavy-question-content")).toBeInTheDocument();
  });

  it("mounts immediately when eager becomes true and retains it after the frame when eager turns false", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { rerender } = render(<ProgressiveQuestionBody eager={false} label="3번 문항">{child}</ProgressiveQuestionBody>);

    rerender(<ProgressiveQuestionBody eager label="3번 문항">{child}</ProgressiveQuestionBody>);
    expect(screen.getByTestId("heavy-question-content")).toBeInTheDocument();
    expect(animationFrames).toHaveLength(1);

    act(() => animationFrames[0](0));
    expect(screen.getByTestId("heavy-question-content")).toBeInTheDocument();

    rerender(<ProgressiveQuestionBody eager={false} label="3번 문항">{child}</ProgressiveQuestionBody>);
    expect(screen.getByTestId("heavy-question-content")).toBeInTheDocument();
  });

  it("renders content immediately when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    render(<ProgressiveQuestionBody eager={false} label="4번 문항">{child}</ProgressiveQuestionBody>);

    expect(screen.getByTestId("heavy-question-content")).toBeInTheDocument();
  });
});
