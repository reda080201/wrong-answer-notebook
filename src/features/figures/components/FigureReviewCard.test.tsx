import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SheetFigureItem } from "../../../types";
import FigureReviewCard from "./FigureReviewCard";

vi.mock("../../../api", () => ({ getImageUrl: vi.fn(async (name: string) => `blob:${name}`) }));
const figure: SheetFigureItem = { id: "f", questionNumber: "1", title: "test", caption: "", source: "original", original: { image: "original.png" }, cleaned: { image: "cleaned.png", generatedAt: "", sourceImageHash: "", promptVersion: "v7" } };

describe("real user representation selection", () => {
  it("allows keeping the original even when the candidate is unavailable", async () => {
    const onChange = vi.fn();
    render(<FigureReviewCard figure={figure} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "원본 사용" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ preferredRepresentation: "original", representationSelectionSource: "user" }));
    await screen.findByAltText("1번 · 그림 f · test · 정리본 후보");
    fireEvent.error(screen.getByAltText("1번 · 그림 f · test · 정리본 후보"));
    expect(screen.getByRole("button", { name: "정리본 사용" })).toBeDisabled();
  });
  it("records a compared choice and invalidates approval for replacement assets", async () => {
    const onChange = vi.fn();
    const view = render(<FigureReviewCard figure={figure} onChange={onChange} />);
    fireEvent.load(await screen.findByAltText("1번 · 그림 f · test · 원본 도형 crop"));
    fireEvent.load(await screen.findByAltText("1번 · 그림 f · test · 정리본 후보"));
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getByRole("button", { name: "정리본 사용" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "정리본 사용" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ preferredRepresentation: "cleaned", image: "cleaned.png", representationSelectionSource: "user" }));
    view.rerender(<FigureReviewCard figure={{ ...figure, cleaned: { ...figure.cleaned!, image: "replacement.png" } }} onChange={onChange} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "정리본 사용" })).toBeDisabled();
    await screen.findByAltText("1번 · 그림 f · test · 정리본 후보");
  });
});