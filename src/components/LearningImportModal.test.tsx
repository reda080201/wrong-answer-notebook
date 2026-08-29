import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LearningImportModal from "./LearningImportModal";

describe("LearningImportModal", () => {
  it("keeps every close control disabled while saving", () => {
    const onClose = vi.fn();
    let resolveApply: (() => void) | undefined;
    render(<LearningImportModal onClose={onClose} onApply={() => new Promise<void>((resolve) => { resolveApply = resolve; })} />);
    fireEvent.click(screen.getByRole("button", { name: /텍스트 붙여넣기/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "텍스트 붙여넣기" }), { target: { value: "# 미분\n핵심 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "특강 저장" }));
    expect(screen.getByRole("button", { name: "특강 가져오기 닫기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "특강 가져오기 닫기" }));
    expect(onClose).not.toHaveBeenCalled();
    resolveApply?.();
  });
});
