import { afterEach, expect, it, vi } from "vitest";
import { rasterizeVisualImportFile, validatePdfViewport } from "./visualImportFiles";
const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => mocks);
afterEach(() => vi.restoreAllMocks());

it.each([[0, 1], [NaN, 1], [Infinity, 1], [-1, 1], [16385, 1], [8001, 8000]])("rejects unsafe viewport %s x %s", (w, h) => {
  expect(() => validatePdfViewport(w, h, 2)).toThrow("2페이지");
});
it("retains valid rounded dimensions and the pixel boundary", () => {
  expect(validatePdfViewport(7999.5, 8000, 1)).toEqual({ width: 8000, height: 8000 });
});
it.each(["success", "failure", "oversized", "cancel"])("releases canvas/page/document after %s", async (mode) => {
  const controller = new AbortController();
  const cleanup = vi.fn(); const destroy = vi.fn(async () => undefined);
  let canvas: HTMLCanvasElement | undefined;
  const render = vi.fn((options: { canvas: HTMLCanvasElement }) => {
    canvas = options.canvas;
    if (mode === "cancel") controller.abort();
    return { promise: mode === "failure" ? Promise.reject(new Error("render failed")) : Promise.resolve(), cancel: vi.fn() };
  });
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getViewport: () => ({ width: mode === "oversized" ? 20000 : 100, height: 100 }), render, cleanup }), destroy }), destroy });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["fixture"], { type: "image/png" })));
  const input = { name: "fixture.pdf", type: "application/pdf", arrayBuffer: async () => new ArrayBuffer(0) } as File;
  const result = rasterizeVisualImportFile(input, { signal: controller.signal });
  if (mode === "success") expect(await result).toHaveLength(1);
  else await expect(result).rejects.toThrow();
  expect(cleanup).toHaveBeenCalledOnce(); expect(destroy).toHaveBeenCalledOnce();
  if (mode === "oversized") expect(render).not.toHaveBeenCalled();
  else { expect(canvas?.width).toBe(0); expect(canvas?.height).toBe(0); }
});
