import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FigureComparisonPanel from "./FigureComparisonPanel";
import type { SheetFigureItem } from "../../../types";

vi.mock("../../../api", () => ({ getImageUrl: vi.fn(async (name: string) => `blob:${name}`) }));
const figure: SheetFigureItem = { id: "f", questionNumber: "1", title: "graph", caption: "", source: "original", original: { image: "original.png" }, cleaned: { image: "cleaned.png", generatedAt: "", sourceImageHash: "", promptVersion: "v7" } };

describe("diagram comparison readiness", () => {
  it("does not allow comparing absent images while their URLs are pending", async () => {
    render(<FigureComparisonPanel figure={figure} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    await screen.findByAltText("원본 도형 crop");
  });
  it("requires both images to load and a real comparison action", async () => {
    const ready = vi.fn();
    render(<FigureComparisonPanel figure={figure} onReady={ready} />);
    const original = await screen.findByAltText("원본 도형 crop");
    const cleaned = await screen.findByAltText("정리본 후보");
    fireEvent.load(original);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    fireEvent.load(cleaned);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true));
    fireEvent.error(cleaned);
    await waitFor(() => expect(ready).toHaveBeenLastCalledWith(false));
  });
});
