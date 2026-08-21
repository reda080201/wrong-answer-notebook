import { render, screen } from "@testing-library/react";
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

  it("uses accessible button semantics and contextual alt text", async () => {
    vi.mocked(getImageUrl).mockResolvedValue("blob:figure");

    render(<ImageGallery filenames={["graph.png"]} alt="함수 그래프" />);

    const trigger = await screen.findByRole("button", { name: "함수 그래프 확대 보기" });
    expect(trigger.querySelector("img")).toHaveAttribute("alt", "함수 그래프");
  });
});
