import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getImageUrl } from "../../../api";
import OriginalPageExamReader from "./OriginalPageExamReader";

vi.mock("../../../api", () => ({ getImageUrl: vi.fn(async (filename: string) => `blob:${filename}`) }));

class TestResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: 300, height: 400 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  disconnect() {}
  unobserve() {}
}

vi.stubGlobal("ResizeObserver", TestResizeObserver);
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });

function renderReader() {
  vi.mocked(getImageUrl).mockClear();
  const onChangePage = vi.fn();
  const onSelectPages = vi.fn();
  render(<OriginalPageExamReader
    filenames={["page-1.png", "page-2.png"]}
    selectedFilenames={["page-1.png", "page-2.png"]}
    currentFilename="page-1.png"
    onChangePage={onChangePage}
    onSelectPages={onSelectPages}
  />);
  return {
    reader: screen.getByLabelText("원본 문제지 페이지 보기"),
    viewport: screen.getByLabelText("원본 페이지. 좌우 방향키로 넘길 수 있습니다."),
    onChangePage,
    onSelectPages,
  };
}

function touch(x: number, y: number, target: EventTarget) {
  return { identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 };
}

describe("OriginalPageExamReader touch navigation", () => {
  it.each(["", "   "])("treats a fulfilled empty URL %j as failure and retries only that page", async missing => {
    vi.mocked(getImageUrl).mockResolvedValueOnce(missing).mockResolvedValueOnce("blob:page-2.png");
    const { onSelectPages, onChangePage } = renderReader();
    expect(await screen.findByRole("alert")).toHaveTextContent("문항 텍스트 보기에서 계속 풀 수도 있습니다");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    vi.mocked(getImageUrl).mockResolvedValueOnce("blob:recovered.png");
    fireEvent.click(screen.getByRole("button", { name: "이 페이지 다시 불러오기" }));
    await waitFor(() => expect(screen.getByAltText("원본 문제지 페이지 1")).toHaveAttribute("src", "blob:recovered.png"));
    expect(getImageUrl).toHaveBeenCalledTimes(3);
    expect(getImageUrl).toHaveBeenLastCalledWith("page-1.png");
    expect(screen.getByAltText("페이지 2 미리보기")).toHaveAttribute("src", "blob:page-2.png");
    expect(onSelectPages).not.toHaveBeenCalled();
    expect(onChangePage).not.toHaveBeenCalled();
  });

  it("handles rejected reads and repeated retry failures without getting stuck loading", async () => {
    vi.mocked(getImageUrl).mockRejectedValueOnce(new Error("read failed"));
    renderReader();
    await screen.findByRole("alert");
    vi.mocked(getImageUrl).mockRejectedValueOnce(new Error("still missing"));
    fireEvent.click(screen.getByRole("button", { name: "이 페이지 다시 불러오기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("불러오지 못했습니다");
    expect(screen.queryByText("원본 페이지를 불러오는 중…")).not.toBeInTheDocument();
  });

  it("retries an image decode error without resetting zoom or the selected pages", async () => {
    renderReader();
    const image = await screen.findByAltText("원본 문제지 페이지 1");
    fireEvent.click(screen.getByRole("button", { name: "보기·도구" }));
    fireEvent.click(screen.getByRole("button", { name: "확대" }));
    const percent = screen.getByText(/\d+%/).textContent;
    fireEvent.error(image);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "이 페이지 다시 불러오기" }));
    await screen.findByAltText("원본 문제지 페이지 1");
    expect(screen.getByText(/\d+%/)).toHaveTextContent(percent!);
    expect(screen.getAllByRole("checkbox").every(input => (input as HTMLInputElement).checked)).toBe(true);
  });

  it("ignores retry completion after the reader switches to another asset list", async () => {
    vi.mocked(getImageUrl).mockResolvedValueOnce("");
    const props = { onChangePage: vi.fn(), onSelectPages: vi.fn() };
    const { rerender } = render(<OriginalPageExamReader {...props} filenames={["old.png"]} />);
    await screen.findByRole("alert");
    let finish!: (url: string) => void;
    vi.mocked(getImageUrl).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "이 페이지 다시 불러오기" }));
    vi.mocked(getImageUrl).mockResolvedValueOnce("blob:new.png");
    rerender(<OriginalPageExamReader {...props} filenames={["new.png"]} />);
    await waitFor(() => expect(screen.getByAltText("원본 문제지 페이지 1")).toHaveAttribute("src", "blob:new.png"));
    finish("blob:old.png");
    await waitFor(() => expect(screen.getByAltText("원본 문제지 페이지 1")).toHaveAttribute("src", "blob:new.png"));
  });

  it("uses horizontal gestures for image pan when the viewport overflows", async () => {
    const { reader, viewport, onChangePage } = renderReader();
    await screen.findByAltText("원본 문제지 페이지 1");
    Object.defineProperty(viewport, "scrollWidth", { configurable: true, value: 500 });
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 300 });

    fireEvent.touchStart(reader, { touches: [touch(240, 100, reader)] });
    fireEvent.touchEnd(reader, { changedTouches: [touch(100, 105, reader)] });
    expect(onChangePage).not.toHaveBeenCalledWith("page-2.png");
  });

  it("turns a page on a horizontal gesture when the image fits", async () => {
    const { reader, viewport, onChangePage } = renderReader();
    await screen.findByAltText("원본 문제지 페이지 1");
    Object.defineProperty(viewport, "scrollWidth", { configurable: true, value: 300 });
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 300 });

    fireEvent.touchStart(reader, { touches: [touch(240, 100, reader)] });
    fireEvent.touchEnd(reader, { changedTouches: [touch(100, 105, reader)] });
    expect(onChangePage).toHaveBeenCalledWith("page-2.png");
  });

  it("ignores vertical gestures, interactive controls, and cancelled gestures", async () => {
    const { reader, onChangePage } = renderReader();
    await screen.findByAltText("원본 문제지 페이지 1");

    fireEvent.touchStart(reader, { touches: [touch(100, 240, reader)] });
    fireEvent.touchEnd(reader, { changedTouches: [touch(105, 100, reader)] });
    const nextButton = screen.getByRole("button", { name: "다음 페이지" });
    fireEvent.touchStart(reader, { touches: [touch(240, 100, reader)] });
    fireEvent.touchStart(nextButton, { touches: [touch(240, 100, nextButton)] });
    fireEvent.touchEnd(reader, { changedTouches: [touch(100, 105, reader)] });
    fireEvent.touchStart(reader, { touches: [touch(240, 100, reader)] });
    fireEvent.touchCancel(reader);
    fireEvent.touchEnd(reader, { changedTouches: [touch(100, 105, reader)] });

    expect(onChangePage).not.toHaveBeenCalledWith("page-2.png");
    expect(getImageUrl).toHaveBeenCalledTimes(2);
  });
});
