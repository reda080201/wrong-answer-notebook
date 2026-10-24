import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ExamPaperCompositor, { type ExamPaperItem } from "./ExamPaperCompositor";

const originalRect = HTMLElement.prototype.getBoundingClientRect;

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});

function item(id: string): ExamPaperItem {
  return { id, node: <article>{id}</article> };
}

describe("ExamPaperCompositor", () => {
  it("turns actual pages and preserves their composition when switching direction", () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({ width: 339, height: 400, top: 0, left: 0, right: 339, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }));
    const items = Array.from({ length: 10 }, (_, index) => item(String(index + 1)));
    const { rerender, container } = render(<ExamPaperCompositor enabled items={items} navigation="horizontal-pages" />);
    const before = [...container.querySelectorAll("[data-paper-page]")].map(page => page.textContent);
    const navigation = screen.getByRole("navigation", { name: "시험지 페이지 상단 이동" });
    expect(within(navigation).getByRole("button", { name: "이전 페이지" })).toBeDisabled();
    fireEvent.click(within(navigation).getByRole("button", { name: "다음 페이지" }));
    expect(screen.getByLabelText("시험지 2페이지")).toBeVisible();
    expect(screen.getByLabelText("시험지 1페이지")).not.toBeVisible();
    fireEvent.keyDown(screen.getByLabelText("시험지 2페이지"), { key: "ArrowRight" });
    expect(screen.getByLabelText("시험지 3페이지")).toBeVisible();
    expect(within(navigation).getByRole("button", { name: "다음 페이지" })).toBeDisabled();
    rerender(<ExamPaperCompositor enabled items={items} navigation="vertical-pages" />);
    expect([...container.querySelectorAll("[data-paper-page]")].map(page => page.textContent)).toEqual(before);
    expect(container.querySelector('[data-paper-number="9"]')).toHaveAttribute("aria-current", "step");
  });

  it("allows horizontal arrows on the paper surface but not from controls or their descendants", () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({ width: 339, height: 400, top: 0, left: 0, right: 339, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }));
    const items = [
      { id: "1", node: <article><button type="button"><span>선택지</span></button><input aria-label="답 입력" /></article> },
      ...Array.from({ length: 9 }, (_, index) => item(String(index + 2))),
    ];
    const { container } = render(<ExamPaperCompositor enabled items={items} navigation="horizontal-pages" />);
    const reader = container.querySelector<HTMLElement>(".exam-paper-reader")!;

    fireEvent.keyDown(reader, { key: "ArrowRight" });
    expect(screen.getByLabelText("시험지 2페이지")).toBeVisible();

    fireEvent.keyDown(container.querySelector("button span")!, { key: "ArrowLeft" });
    expect(screen.getByLabelText("시험지 2페이지")).toBeVisible();

    fireEvent.keyDown(container.querySelector("input")!, { key: "ArrowLeft" });
    expect(screen.getByLabelText("시험지 2페이지")).toBeVisible();
  });

  it("ignores swipes that start or end on an interactive target and keeps empty-surface swipes", () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({ width: 339, height: 400, top: 0, left: 0, right: 339, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }));
    const items = [
      { id: "1", node: <button type="button">선택</button> },
      ...Array.from({ length: 9 }, (_, index) => item(String(index + 2))),
    ];
    const { container } = render(<ExamPaperCompositor enabled items={items} navigation="horizontal-pages" />);
    const reader = container.querySelector<HTMLElement>(".exam-paper-reader")!;
    const button = container.querySelector("button")!;

    fireEvent.touchStart(button, { touches: [{ identifier: 1, clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(button, { changedTouches: [{ identifier: 1, clientX: 20, clientY: 100 }] });
    expect(screen.getByLabelText("시험지 1페이지")).toBeVisible();

    fireEvent.touchStart(reader, { touches: [{ identifier: 2, clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(button, { changedTouches: [{ identifier: 2, clientX: 20, clientY: 100 }] });
    expect(screen.getByLabelText("시험지 1페이지")).toBeVisible();

    fireEvent.touchStart(reader, { touches: [{ identifier: 3, clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(reader, { changedTouches: [{ identifier: 3, clientX: 20, clientY: 100 }] });
    expect(screen.getByLabelText("시험지 2페이지")).toBeVisible();
  });

  it("packs measured items into visible A4 page surfaces instead of fixed item slices", () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      const height = this.textContent === "one" || this.textContent === "two" ? 620 : 180;
      return { width: 600, height, top: 0, left: 0, right: 600, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    render(<ExamPaperCompositor enabled layout="single" items={[item("one"), item("two"), item("three")]} />);

    expect(screen.getAllByLabelText(/시험지 .*페이지/)).toHaveLength(2);
    expect(screen.getByLabelText("시험지 1페이지")).toHaveTextContent("one");
    expect(screen.getByLabelText("시험지 2페이지")).toHaveTextContent("two");
  });

  it("keeps consecutive shared-passage items together in the next column when space is needed", () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      const height = this.textContent === "intro" ? 500 : 340;
      return { width: 600, height, top: 0, left: 0, right: 600, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    render(<ExamPaperCompositor enabled items={[
      item("intro"),
      { ...item("passage-question-1"), groupId: "passage-a" },
      { ...item("passage-question-2"), groupId: "passage-a" },
    ]} />);

    expect(screen.getByLabelText("시험지 1페이지").querySelectorAll(".exam-paper-page__column")[1]).toHaveTextContent("passage-question-1");
    expect(screen.getByLabelText("시험지 1페이지").querySelectorAll(".exam-paper-page__column")[1]).toHaveTextContent("passage-question-2");
  });

  it("removes canonical target IDs from the hidden measurement tree", () => {
    render(<ExamPaperCompositor enabled items={[{ id: "q9", node: <article id="sheet-question-canonical-9">9번</article> }]} />);
    expect(document.querySelectorAll("#sheet-question-canonical-9")).toHaveLength(1);
  });

  it("reserves loaded lazy image dimensions in offscreen measurement clones", () => {
    const dimensions = new Map<string, [string | null, string | null]>();
    const width = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(240);
    const height = vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(140);
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      if (this.closest(".exam-paper-measure")) this.querySelectorAll<HTMLImageElement>("img").forEach(image => dimensions.set(image.alt, [image.getAttribute("width"), image.getAttribute("height")]));
      return { width: 339, height: 400, top: 0, left: 0, right: 339, bottom: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    try {
      const { container } = render(<ExamPaperCompositor enabled items={[{ id: "images", node: <article><img src="/figure.png" alt="intrinsic" loading="lazy" /><img src="/figure.png" alt="one-dimension" width="120" loading="lazy" /><img src="/figure.png" alt="explicit" width="80" height="90" loading="lazy" /></article> }]} />);
      expect(dimensions.get("intrinsic")).toEqual(["240", "140"]);
      expect(dimensions.get("one-dimension")).toEqual(["120", "70"]);
      expect(dimensions.get("explicit")).toEqual(["80", "90"]);
      expect(container.querySelector('img[alt="intrinsic"]')).not.toHaveAttribute("width");
      expect(container.querySelector('img[alt="intrinsic"]')).toHaveAttribute("loading", "lazy");
    } finally { width.mockRestore(); height.mockRestore(); complete.mockRestore(); }
  });

  it("retains a loaded image height while its replacement URL is pending", async () => {
    let stageHeight = 600;
    let imageState: "loaded" | "pending" | "resolved" = "loaded";
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockImplementation(() => imageState !== "pending");
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      const height = this.closest(".exam-paper-measure") ? stageHeight : 600;
      return { width: 339, height, top: 0, left: 0, right: 339, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    const makeItems = (imageState: "loaded" | "pending" | "resolved"): ExamPaperItem[] => [{
      id: "image",
      node: <article>{imageState === "pending" ? <div data-image-loading="true">loading</div> : <img src={`/figure-${imageState}.png`} alt="figure" loading="lazy" />}</article>,
    }];
    try {
      const { container, rerender } = render(<ExamPaperCompositor enabled items={makeItems("loaded")} measurementKey="image-lifecycle" />);
      const reader = container.querySelector<HTMLElement>(".exam-paper-reader")!;
      await waitFor(() => expect(reader).toHaveAttribute("data-paper-layout-state", "ready"));
      expect(container.querySelector('[data-paper-item="image"]')).toHaveAttribute("data-paper-measured-height", "600");

      imageState = "pending";
      stageHeight = 400;
      rerender(<ExamPaperCompositor enabled items={makeItems("pending")} measurementKey="image-lifecycle" />);
      await waitFor(() => expect(reader).toHaveAttribute("data-paper-layout-state", "pending"));
      expect(container.querySelector('[data-paper-item="image"]')).toHaveAttribute("data-paper-measured-height", "600");

      imageState = "resolved";
      stageHeight = 500;
      rerender(<ExamPaperCompositor enabled items={makeItems("resolved")} measurementKey="image-lifecycle" />);
      await waitFor(() => expect(reader).toHaveAttribute("data-paper-layout-state", "ready"));
      expect(container.querySelector('[data-paper-item="image"]')).toHaveAttribute("data-paper-measured-height", "500");
    } finally {
      complete.mockRestore();
    }
  });

  it("observes replacement items after repagination and measures their later growth", async () => {
    const observed = new Map<Element, ResizeObserverCallback>();
    const previousObserver = globalThis.ResizeObserver;
    class TrackingResizeObserver {
      private targets = new Set<Element>();
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) { this.targets.add(target); observed.set(target, this.callback); }
      unobserve(target: Element) { this.targets.delete(target); observed.delete(target); }
      disconnect() { for (const target of this.targets) observed.delete(target); this.targets.clear(); }
    }
    vi.stubGlobal("ResizeObserver", TrackingResizeObserver);
    let lastHeight = 600;
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      const height = this.textContent === "third" ? lastHeight : 600;
      return { width: 706, height, top: 0, left: 0, right: 706, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    try {
      const { container, unmount } = render(<ExamPaperCompositor enabled layout="single" items={[item("first"), item("second"), item("third")]} />);
      expect(screen.getAllByLabelText(/시험지 .*페이지/)).toHaveLength(3);
      const current = container.querySelector('[data-paper-item="third"]')!;
      expect(observed.has(current)).toBe(true);
      lastHeight = 1200;
      act(() => observed.get(current)!([{ target: current } as ResizeObserverEntry], {} as ResizeObserver));
      await waitFor(() => expect(screen.getByLabelText("시험지 3페이지")).toHaveClass("exam-paper-page--oversized"));
      expect(observed.has(container.querySelector('[data-paper-item="third"]')!)).toBe(true);
      unmount();
      expect(observed.size).toBe(0);
    } finally {
      vi.stubGlobal("ResizeObserver", previousObserver);
    }
  });

  it("isolates an item taller than a printable column instead of clipping it", () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      const height = this.textContent === "long" ? 1200 : 180;
      return { width: 280, height, top: 0, left: 0, right: 280, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    render(<ExamPaperCompositor enabled layout="columns" items={[item("short"), item("long"), item("after")]} />);

    const oversizedPage = screen.getByLabelText("시험지 2페이지");
    expect(oversizedPage).toHaveClass("exam-paper-page--oversized");
    expect(oversizedPage).toHaveTextContent("long");
    expect(screen.getByLabelText("시험지 3페이지")).toHaveTextContent("after");
  });
});
