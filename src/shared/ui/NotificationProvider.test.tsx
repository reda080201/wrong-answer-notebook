import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import Dialog from "./Dialog";
import { NotificationProvider, NotificationRegion, useNotification } from "./NotificationProvider";
import Snackbar from "./Snackbar";

function Actions({ action }: { action: () => Promise<void> }) {
  const { notify } = useNotification();
  return <><button onClick={() => { notify({ message: "첫 알림", actionLabel: "다시 시도", onAction: action }); notify({ message: "둘째 알림" }); }}>알림 만들기</button>
    <NotificationRegion><Snackbar actionLabel="실행 취소" onAction={() => undefined}>삭제 안내</Snackbar></NotificationRegion></>;
}

function DialogNotices() {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  return <><Actions action={vi.fn()} /><button onClick={() => setOpen(true)}>설정 열기</button>
    <Dialog open={open} title="설정" onClose={() => setOpen(false)}><button onClick={() => setNested(true)}>자식 열기</button></Dialog>
    <Dialog open={nested} title="자식" onClose={() => setNested(false)}><button onClick={() => setNested(false)}>자식 닫기</button></Dialog>
  </>;
}

describe("shared notification stack", () => {
  it("moves the same notice into the top dialog and restores it without remounting", async () => {
    render(<NotificationProvider><DialogNotices /></NotificationProvider>);
    const undo = screen.getByRole("button", { name: "실행 취소" });
    fireEvent.click(screen.getByRole("button", { name: "설정 열기" }));
    await waitFor(() => expect(undo.closest('[role="dialog"]')).toBe(screen.getByRole("dialog", { name: "설정" })));
    fireEvent.click(screen.getByRole("button", { name: "자식 열기" }));
    await waitFor(() => expect(undo.closest('[role="dialog"]')).toBe(screen.getByRole("dialog", { name: "자식" })));
    fireEvent.click(screen.getByRole("button", { name: "자식 닫기" }));
    await waitFor(() => expect(undo.closest('[role="dialog"]')).toBe(screen.getByRole("dialog", { name: "설정" })));
    undo.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("dialog", { name: "설정" })).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(undo.closest('[role="dialog"]')).toBeNull());
    expect(screen.getByRole("button", { name: "실행 취소" })).toBe(undo);
    expect(document.querySelectorAll('.notification-stack')).toHaveLength(1);
  });
  it("handles a persistent deletion-notice failure and permits retry", async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error("실행 취소 실패")).mockResolvedValueOnce(undefined);
    render(<Snackbar actionLabel="실행 취소" onAction={action}>삭제 안내</Snackbar>);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    await screen.findByText("실행 취소 실패");
    await waitFor(() => expect(screen.getByRole("button", { name: "실행 취소" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    await waitFor(() => expect(screen.queryByText("실행 취소 실패")).not.toBeInTheDocument());
    expect(action).toHaveBeenCalledTimes(2);
  });
  it("keeps persistent and transient notices in the same stack", () => {
    const { container } = render(<NotificationProvider><Actions action={vi.fn()} /></NotificationProvider>);
    fireEvent.click(screen.getByText("알림 만들기"));
    expect(container.querySelectorAll(".notification-stack")).toHaveLength(1);
    expect(container.querySelectorAll(".notification-stack .app-snackbar")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "실행 취소" })).toBeEnabled();
  });
  it("retains a failed action for retry and dismisses only after successful completion", async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error("저장 실패")).mockResolvedValueOnce(undefined);
    render(<NotificationProvider><Actions action={action} /></NotificationProvider>);
    fireEvent.click(screen.getByText("알림 만들기"));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByText("저장 실패");
    await waitFor(() => expect(screen.getByRole("button", { name: "다시 시도" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.queryByText("첫 알림")).not.toBeInTheDocument());
    expect(action).toHaveBeenCalledTimes(2);
    expect(screen.getByText("둘째 알림")).toBeVisible();
    expect(screen.getByText("삭제 안내")).toBeVisible();
  });
});
