import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TextReviewSplitView from "./TextReviewSplitView";

describe("TextReviewSplitView", () => {
  it("keeps source editing and the MathText preview in one review surface", () => {
    const onChange = vi.fn();
    render(<TextReviewSplitView id="review" label="본문" value="x^2" onChange={onChange} />);

    expect(screen.getByLabelText("본문")).toHaveValue("x^2");
    expect(screen.getByRole("heading", { name: "본문 수식 미리보기" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("본문"), { target: { value: "x + 1" } });
    expect(onChange).toHaveBeenCalledWith("x + 1");
  });

  it("selects a suspicious source range from the review navigator", () => {
    render(<TextReviewSplitView id="review" label="본문" value="밀죳 값을 구하시오." onChange={vi.fn()} />);

    const source = screen.getByLabelText("본문") as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole("button", { name: /OCR 의심 조각/ }));
    expect(source.selectionStart).toBe(0);
    expect(source.selectionEnd).toBeGreaterThan(0);
  });
});
