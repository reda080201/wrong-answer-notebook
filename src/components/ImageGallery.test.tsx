import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getImageUrl } from "../api";
import ImageGallery from "./ImageGallery";

vi.mock("../api", () => ({
  getImageUrl: vi.fn(),
}));

describe("ImageGallery", () => {
  beforeEach(() => {
    vi.mocked(getImageUrl).mockReset();
  });

  it("shows an error placeholder when an image fails to load", async () => {
    vi.mocked(getImageUrl).mockRejectedValue(new Error("missing"));

    render(<ImageGallery filenames={["missing.png"]} />);

    expect(
      await screen.findByText("이미지를 불러올 수 없습니다"),
    ).toBeInTheDocument();
  });

  it("uses a button with contextual alternative text to open an image", async () => {
    vi.mocked(getImageUrl).mockResolvedValue("blob:figure");

    render(<ImageGallery filenames={["graph.png"]} alt="함수 그래프" />);

    const trigger = await screen.findByRole("button", { name: "함수 그래프 이미지 열기" });
    expect(trigger.querySelector("img")).toHaveAttribute("alt", "함수 그래프");
  });

  it("treats an empty URL as failure and allows retry", async () => {
    vi.mocked(getImageUrl).mockResolvedValueOnce("").mockResolvedValueOnce("blob:retry");
    render(<ImageGallery filenames={["empty.png"]} />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "이미지 다시 불러오기" }));
    expect(await screen.findByRole("button", { name: "첨부 이미지 이미지 열기" })).toBeEnabled();
    expect(getImageUrl).toHaveBeenCalledTimes(2);
  });

  it("handles decoded-image failure in the expanded view without deleting its reference", async () => {
    vi.mocked(getImageUrl).mockResolvedValue("blob:broken");
    render(<ImageGallery filenames={["broken.png"]} />);
    fireEvent.click(await screen.findByRole("button", { name: "첨부 이미지 이미지 열기" }));
    const dialog = screen.getByRole("dialog", { name: "이미지 확대 보기" });
    fireEvent.error(within(dialog).getByRole("img"));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("저장된 연결은 유지됩니다");
    expect(within(dialog).getByRole("button", { name: "이미지 다시 불러오기" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(document.querySelector(".image-gallery")).toHaveFocus();
  });

  it("uses the temporary resolver and ignores a superseded resolver completion", async () => {
    let finish!: (value: string) => void;
    const oldResolver = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const newResolver = vi.fn().mockResolvedValue("blob:temporary");
    const view = render(<ImageGallery filenames={["same.png"]} resolveImageUrl={oldResolver} />);
    view.rerender(<ImageGallery filenames={["same.png"]} resolveImageUrl={newResolver} />);
    const image = await screen.findByRole("img");
    expect(image).toHaveAttribute("src", "blob:temporary");
    finish("blob:stale");
    await waitFor(() => expect(image).toHaveAttribute("src", "blob:temporary"));
    expect(getImageUrl).not.toHaveBeenCalled();
  });
});
