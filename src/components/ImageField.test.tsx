import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ImageField from "./ImageField";
import { getImageUrl } from "../api";
vi.mock("../api", () => ({ getImageUrl: vi.fn(), pickImages: vi.fn(), saveImageFiles: vi.fn() }));
it("shows empty URL failures and retries only the failed image without revoking shared URLs", async () => {
  vi.mocked(getImageUrl).mockImplementation(async name => name === "good.png" ? "data:image/png;base64,good" : "");
  const props = { label: "문제", images: ["good.png", "bad.png"], onChange: vi.fn(), onRemove: vi.fn() };
  const view = render(<ImageField {...props} />);
  await screen.findByRole("button", { name: "bad.png 이미지 다시 불러오기" });
  expect(getImageUrl).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "bad.png 이미지 다시 불러오기" }));
  await waitFor(() => expect(getImageUrl).toHaveBeenCalledTimes(3));
  expect(vi.mocked(getImageUrl).mock.calls.filter(([name]) => name === "good.png")).toHaveLength(1);
  const image = view.container.querySelector("img")!;
  fireEvent.error(image);
  expect(screen.getByRole("button", { name: "good.png 이미지 다시 불러오기" })).toBeInTheDocument();
});
it("ignores an old file response after replacement", async () => {
  let resolveOld!: (url: string) => void;
  vi.mocked(getImageUrl).mockImplementation(name => name === "old.png" ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve("data:image/png;base64,new"));
  const props = { label: "문제", onChange: vi.fn(), onRemove: vi.fn() };
  const view = render(<ImageField {...props} images={["old.png"]} />);
  view.rerender(<ImageField {...props} images={["new.png"]} />);
  resolveOld("data:image/png;base64,old");
  await waitFor(() => expect(view.container.querySelector("img")).toHaveAttribute("src", "data:image/png;base64,new"));
});
