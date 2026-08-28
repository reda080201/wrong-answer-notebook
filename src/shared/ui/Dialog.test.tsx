import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Dialog from "./Dialog";

describe("Dialog", () => {
  it("moves focus inside, traps Tab, closes with Escape, and restores focus", async () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <Dialog open onClose={onClose} ariaLabel="테스트 dialog">
        <button type="button">첫 번째</button>
        <button type="button">마지막</button>
      </Dialog>,
    );

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(screen.getByRole("button", { name: "첫 번째" })).toHaveFocus();
    screen.getByRole("button", { name: "마지막" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "첫 번째" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("does not close while closing is disabled", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} ariaLabel="저장 중" closeDisabled>
        <button type="button">확인</button>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(screen.getByRole("presentation"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sends Escape only to the topmost nested dialog", async () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    render(
      <Dialog open onClose={parentClose} ariaLabel="부모 dialog">
        <button type="button">부모 확인</button>
        <Dialog open onClose={childClose} ariaLabel="자식 dialog">
          <button type="button">자식 확인</button>
        </Dialog>
      </Dialog>,
    );

    await new Promise((resolve) => requestAnimationFrame(resolve));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(childClose).toHaveBeenCalledOnce();
    expect(parentClose).not.toHaveBeenCalled();
  });

  it("supports size variants and header/body/footer slots", () => {
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="슬롯 dialog"
        size="xl"
        header={<span>추가 헤더</span>}
        footer={<button type="button">저장</button>}
      >
        <p>내용</p>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "슬롯 dialog" });
    expect(dialog).toHaveClass("dialog-size-xl");
    expect(dialog).toHaveClass("modal-card");
    expect(screen.getByText("추가 헤더")).toBeInTheDocument();
    expect(screen.getByText("내용")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument();
  });
});
