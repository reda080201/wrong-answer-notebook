import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FigureComparisonPanel from "./FigureComparisonPanel";
import type { SheetFigureItem } from "../../../types";

vi.mock("../../../api", () => ({ getImageUrl: vi.fn(async (name: string) => `blob:${name}`) }));
const figure: SheetFigureItem = { id: "f", questionNumber: "1", title: "graph", caption: "", source: "original", original: { image: "original.png" }, cleaned: { image: "cleaned.png", generatedAt: "", sourceImageHash: "", promptVersion: "v7" } };

describe("diagram comparison readiness", () => {
  it("distinguishes two figures and their overlay images without inventing descriptions", async () => {
    render(<><FigureComparisonPanel figure={{ ...figure, title: "", id: "left" }} /><FigureComparisonPanel figure={{ ...figure, title: "", id: "right" }} /></>);
    expect(await screen.findByAltText("1번 · 그림 left · 원본 도형 crop")).toBeInTheDocument();
    expect(await screen.findByAltText("1번 · 그림 right · 원본 도형 crop")).toBeInTheDocument();
    for (const button of await screen.findAllByRole("button", { name: "겹쳐보기" })) fireEvent.click(button);
    expect(screen.getByAltText("1번 · 그림 left · 원본 겹쳐보기")).toBeInTheDocument();
    expect(screen.getByAltText("1번 · 그림 right · 정리본 겹쳐보기")).toBeInTheDocument();
  });
  it("does not allow comparing absent images while their URLs are pending", async () => {
    render(<FigureComparisonPanel figure={figure} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    await screen.findByAltText(/그림 f.*원본 도형 crop/);
  });
  it("requires both images to load and a real comparison action", async () => {
    const ready = vi.fn();
    render(<FigureComparisonPanel figure={figure} onReady={ready} />);
    const original = await screen.findByAltText(/그림 f.*원본 도형 crop/);
    const cleaned = await screen.findByAltText(/그림 f.*정리본 후보/);
    fireEvent.load(original);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    fireEvent.load(cleaned);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true));
    fireEvent.error(cleaned);
    await waitFor(() => expect(ready).toHaveBeenLastCalledWith(false));
  });
  it("shows retry only after failure and requires fresh comparison after retry", async () => {
    render(<FigureComparisonPanel figure={figure} />);
    expect(screen.queryByRole("button", { name: "비교 이미지 다시 불러오기" })).not.toBeInTheDocument();
    fireEvent.error(await screen.findByAltText(/그림 f.*정리본 후보/));
    fireEvent.click(screen.getByRole("button", { name: "비교 이미지 다시 불러오기" }));
    expect(screen.queryByRole("button", { name: "비교 이미지 다시 불러오기" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    fireEvent.load(await screen.findByAltText(/그림 f.*원본 도형 crop/));
    fireEvent.load(await screen.findByAltText(/그림 f.*정리본 후보/));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});
