import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
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

  it.each(["hidden", "disabled", "detached", "outside", "disabled fieldset"] as const)(
    "falls back to a valid button when initialFocusRef targets a %s element",
    async (kind) => {
      const initialFocusRef = { current: null as HTMLElement | null };
      const captureInvalid = (element: HTMLButtonElement | null) => { initialFocusRef.current = element; };
      let invalidTarget: ReactNode = null;
      let outsideTarget: HTMLButtonElement | undefined;

      if (kind === "hidden") invalidTarget = <button ref={captureInvalid} hidden>숨김 대상</button>;
      if (kind === "disabled") invalidTarget = <button ref={captureInvalid} disabled>비활성 대상</button>;
      if (kind === "disabled fieldset") invalidTarget = <fieldset disabled><button ref={captureInvalid}>필드셋 대상</button></fieldset>;
      if (kind === "detached") initialFocusRef.current = document.createElement("button");
      if (kind === "outside") {
        outsideTarget = document.createElement("button");
        document.body.append(outsideTarget);
        initialFocusRef.current = outsideTarget;
      }

      render(
        <Dialog open onClose={vi.fn()} ariaLabel="초기 포커스" initialFocusRef={initialFocusRef}>
          {invalidTarget}
          <button type="button">유효한 확인</button>
        </Dialog>,
      );

      try {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        expect(screen.getByRole("button", { name: "유효한 확인" })).toHaveFocus();
      } finally {
        outsideTarget?.remove();
      }
    },
  );

  it("supports a heading with tabIndex -1 as an explicit initial focus target", async () => {
    const initialFocusRef = { current: null as HTMLElement | null };
    const captureHeading = (element: HTMLHeadingElement | null) => { initialFocusRef.current = element; };

    render(
      <Dialog open onClose={vi.fn()} ariaLabel="설명 dialog" initialFocusRef={initialFocusRef}>
        <h2 ref={captureHeading} tabIndex={-1}>설명 제목</h2>
        <button type="button">계속</button>
      </Dialog>,
    );

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(screen.getByRole("heading", { name: "설명 제목" })).toHaveFocus();
  });

  it("tries the next focus candidate when the first candidate focus call is a no-op", async () => {
    render(
      <Dialog open onClose={vi.fn()} ariaLabel="포커스 후보">
        <button type="button">포커스 불가</button>
        <button type="button">다음 후보</button>
      </Dialog>,
    );
    const first = screen.getByRole("button", { name: "포커스 불가" });
    const noOpFocus = vi.spyOn(first, "focus").mockImplementation(() => undefined);

    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(noOpFocus).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "다음 후보" })).toHaveFocus();
  });

  it("focuses only the topmost nested dialog after both animation frames", async () => {
    render(
      <Dialog open onClose={vi.fn()} ariaLabel="포커스 부모">
        <button type="button">부모 버튼</button>
        <Dialog open onClose={vi.fn()} ariaLabel="포커스 자식">
          <button type="button">자식 버튼</button>
        </Dialog>
      </Dialog>,
    );
    const parentFocus = vi.spyOn(screen.getByRole("button", { name: "부모 버튼", hidden: true }), "focus");
    const childFocus = vi.spyOn(screen.getByRole("button", { name: "자식 버튼" }), "focus");

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    expect(parentFocus).not.toHaveBeenCalled();
    expect(childFocus).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "자식 버튼" })).toHaveFocus();
  });

  it("makes the parent dialog inert while a nested confirmation is open", () => {
    render(
      <Dialog open onClose={vi.fn()} ariaLabel="부모 편집">
        <button type="button">부모 저장</button>
        <Dialog open onClose={vi.fn()} ariaLabel="변경사항 확인">
          <button type="button">변경사항 버리기</button>
        </Dialog>
      </Dialog>,
    );
    const parent = document.querySelector<HTMLElement>('[role="dialog"][aria-label="부모 편집"]');
    expect(parent).not.toBeNull();
    expect(parent).toHaveAttribute("aria-hidden", "true");
    expect(parent).toHaveProperty("inert", true);
    expect(screen.getByRole("dialog", { name: "변경사항 확인" })).toBeInTheDocument();
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
