import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getImageUrl } from "../api";
import ZoomableImageViewer from "./ZoomableImageViewer";

vi.mock("../api", () => ({
  getImageUrl: vi.fn().mockResolvedValue("data:image/png;base64,AA=="),
}));

describe("ZoomableImageViewer", () => {
  it("marks the canonical loading status while the image URL is unresolved", async () => {
    let resolveImage!: (url: string) => void;
    vi.mocked(getImageUrl).mockImplementationOnce(() => new Promise(resolve => { resolveImage = resolve; }));
    render(<ZoomableImageViewer filenames={["pending.png"]} />);

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("data-image-loading", "true");

    resolveImage("data:image/png;base64,AA==");
    expect(await screen.findByRole("button", { name: /확대 보기/ })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("opens an image and supports zoom and reset controls", async () => {
    render(<ZoomableImageViewer filenames={["one.png"]} />);
    fireEvent.click(await screen.findByRole("button", { name: /확대 보기/ }));
    expect(screen.getByRole("dialog", { name: "이미지 확대 보기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "확대" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    expect(screen.getAllByText("100%")).toHaveLength(2);
  });
});
