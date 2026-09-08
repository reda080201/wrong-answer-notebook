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

  it("moves the active option with arrows and executes it with Enter", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(<CommandPalette commands={[
      { id: "first", label: "첫 명령", onExecute: first },
      { id: "second", label: "둘째 명령", onExecute: second },
    ]} />);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(document, { key: "Enter" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not run shell shortcuts while an editable target is focused", () => {
    const onExecute = vi.fn();
    render(<><input aria-label="편집 필드" /><CommandPalette commands={[{ id: "new-entry", label: "새 오답", onExecute }]} /></>);
    const input = screen.getByLabelText("편집 필드");
    fireEvent.keyDown(input, { key: "n", ctrlKey: true });
    fireEvent.keyDown(input, { key: "/" });
    expect(onExecute).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "명령 팔레트" })).not.toBeInTheDocument();
  });
});
