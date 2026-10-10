import { fireEvent, render, screen } from "@testing-library/react";
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
