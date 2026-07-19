import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";

function ThrowingChild({ message = "테스트 렌더 오류" }: { message?: string }) {
  throw new Error(message);
  return null;
}

describe("AppErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("renders children when no render error occurs", () => {
    render(
      <AppErrorBoundary>
        <p>정상 화면</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText("정상 화면")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows Korean recovery UI with alert role and concise error details", () => {
    render(
      <AppErrorBoundary>
        <ThrowingChild message="렌더링 실패" />
      </AppErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("문제가 발생했습니다")).toBeInTheDocument();
    expect(
      screen.getByText(/화면을 불러오는 중 오류가 발생했습니다/),
    ).toBeInTheDocument();
    expect(screen.getByText("렌더링 실패")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새로고침" })).toBeInTheDocument();
  });

  it("reloads the page when the recovery button is clicked", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });

    render(
      <AppErrorBoundary>
        <ThrowingChild />
      </AppErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
