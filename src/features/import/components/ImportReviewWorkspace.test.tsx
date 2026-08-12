import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImportReviewWorkspace from "./ImportReviewWorkspace";

describe("ImportReviewWorkspace", () => {
  it("renders summary, navigator, scrollable body, and fixed footer slots", async () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    render(
      <ImportReviewWorkspace
        open
        title="문제지 검수"
        onClose={onClose}
        summary={<strong>30문항 검수</strong>}
        status="확인 필요 2개"
        questionNavigator={<button type="button">22번</button>}
        footer={<button type="button">바로 저장</button>}
      >
        <p>본문 검수 영역</p>
      </ImportReviewWorkspace>,
    );

    expect(screen.getByRole("dialog", { name: "문제지 검수" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "가져오기 검수 본문" })).toHaveClass("import-review-workspace-body");
    expect(screen.getByText("30문항 검수")).toBeInTheDocument();
    expect(screen.getByText("확인 필요 2개")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "22번" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "바로 저장" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    opener.remove();
  });

  it("keeps the optional sidebar slot available without a navigator", () => {
    render(
      <ImportReviewWorkspace open title="도구 검수" onClose={vi.fn()} sidebar={<p>검수 도구</p>}>
        <p>본문</p>
      </ImportReviewWorkspace>,
    );

    expect(screen.getByRole("region", { name: "검수 도구" })).toHaveTextContent("검수 도구");
  });
});
