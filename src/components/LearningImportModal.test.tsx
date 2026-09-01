import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LearningImportModal from "./LearningImportModal";

describe("LearningImportModal", () => {
  it("keeps every close control disabled while saving", async () => {
    const onClose = vi.fn();
    let resolveApply: (() => void) | undefined;
    render(<LearningImportModal onClose={onClose} onApply={() => new Promise<void>((resolve) => { resolveApply = resolve; })} />);
    fireEvent.click(screen.getByRole("button", { name: /텍스트 붙여넣기/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "텍스트 붙여넣기" }), { target: { value: "# 미분\n핵심 내용" } });
    const saveButton = screen.getByRole("button", { name: "특강 저장" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);
    await waitFor(() => expect(screen.getByRole("button", { name: "특강 가져오기 닫기" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "특강 가져오기 닫기" }));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { resolveApply?.(); });
  });
});
