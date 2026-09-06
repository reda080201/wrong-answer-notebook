import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CommandPalette from "./CommandPalette";

describe("CommandPalette", () => {
  it("opens with Ctrl+K and executes filtered commands", () => {
    const onExecute = vi.fn();
    render(<CommandPalette commands={[{ id: "new-entry", label: "새 오답 추가", onExecute }]} />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "명령 팔레트" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "새 오답 추가" }));
    expect(onExecute).toHaveBeenCalledTimes(1);
  });

  it("focuses the shared search field with slash outside editing targets", () => {
    render(<><input data-search-field aria-label="자료 검색" /><CommandPalette commands={[]} /></>);
    fireEvent.keyDown(document, { key: "/" });
    expect(screen.getByLabelText("자료 검색")).toHaveFocus();
  });
});
