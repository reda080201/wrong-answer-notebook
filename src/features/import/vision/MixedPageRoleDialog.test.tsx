import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MixedPageRoleDialog from "./MixedPageRoleDialog";

const source = {
  sourceKey: "혼합본.pdf",
  pages: [new File(["page one"], "page-1.png", { type: "image/png" }), new File(["page two"], "page-2.png", { type: "image/png" })],
};

describe("MixedPageRoleDialog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("starts each page as mixed and waits for explicit confirmation", () => {
    const onConfirm = vi.fn();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    render(<MixedPageRoleDialog sources={[source]} onConfirm={onConfirm} onCancel={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "혼합본.pdf 물리 페이지 1 역할" })).toHaveValue("mixed");
    expect(screen.getByRole("combobox", { name: "혼합본.pdf 물리 페이지 2 역할" })).toHaveValue("mixed");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("applies a valid page range and confirms every page role", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const onConfirm = vi.fn();
    render(<MixedPageRoleDialog sources={[source]} onConfirm={onConfirm} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByRole("spinbutton", { name: "시작 페이지" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "끝 페이지" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "일괄 적용 역할" }), { target: { value: "problem" } });
    fireEvent.click(screen.getByRole("button", { name: "범위 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "역할 확인" }));

    expect(onConfirm).toHaveBeenCalledWith([
      { sourceKey: "혼합본.pdf", page: 1, role: "problem" },
      { sourceKey: "혼합본.pdf", page: 2, role: "mixed" },
    ]);
  });

  it("cancels without confirming", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<MixedPageRoleDialog sources={[source]} onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
