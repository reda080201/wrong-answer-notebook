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
});
