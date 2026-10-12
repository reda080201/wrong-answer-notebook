import { afterEach, describe, expect, it, vi } from "vitest";
import { validateImportImage } from "./validateImportImage";
import { validPngBytes } from "../../../test/fixtures/validPng";
import { orientedJpegBase64 } from "../../../test/fixtures/orientedJpeg";

describe("native import image validation", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("accepts valid JPEG EXIF orientation %i without changing the size limits", async (orientation) => {
    const swapped = orientation >= 5;
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: swapped ? 60 : 120, height: swapped ? 120 : 60, close }));
    const bytes = Uint8Array.from(atob(orientedJpegBase64[orientation - 1]), c => c.charCodeAt(0));
    await expect(validateImportImage(new File([bytes], "oriented.jpg"))).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });
  it.each([1, 6])("rejects unrelated decoded dimensions even with EXIF orientation %i", async (orientation) => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 121, height: 60, close }));
    const bytes = Uint8Array.from(atob(orientedJpegBase64[orientation - 1]), c => c.charCodeAt(0));
    await expect(validateImportImage(new File([bytes], "mismatch.jpg"))).rejects.toThrow("디코딩");
    expect(close).toHaveBeenCalledOnce();
  });
  it("requires complete decoding and releases the bitmap", async () => {
    const close = vi.fn(); const decode = vi.fn().mockResolvedValue({ width: 1, height: 1, close });
    vi.stubGlobal("createImageBitmap", decode);
    await validateImportImage(new File([validPngBytes], "image.png"));
    expect(decode).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  });
  it("rejects headers that a native decoder cannot read", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("truncated PNG")));
    await expect(validateImportImage(new File([validPngBytes.slice(0, 8)], "image.png"))).rejects.toThrow("디코딩");
  });
  it("rejects mismatched formats and empty decoded dimensions", async () => {
    const close = vi.fn(); vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 0, height: 1, close }));
    await expect(validateImportImage(new File([validPngBytes], "image.jpg"))).rejects.toThrow("확장자");
    await expect(validateImportImage(new File([validPngBytes], "image.png"))).rejects.toThrow("디코딩");
    expect(close).toHaveBeenCalledOnce();
  });
  it("rejects oversized dimensions before invoking the bitmap decoder", async () => {
    const bytes = validPngBytes.slice();
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(16, 16_385);
    const decode = vi.fn(); vi.stubGlobal("createImageBitmap", decode);
    await expect(validateImportImage(new File([bytes], "wide.png"))).rejects.toThrow("해상도");
    expect(decode).not.toHaveBeenCalled();
  });
  it("rejects images whose total decoded pixel count exceeds the budget", async () => {
    const bytes = validPngBytes.slice();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(16, 10_000); view.setUint32(20, 7_000);
    const decode = vi.fn(); vi.stubGlobal("createImageBitmap", decode);
    await expect(validateImportImage(new File([bytes], "pixels.png"))).rejects.toThrow("해상도");
    expect(decode).not.toHaveBeenCalled();
  });
  it("rejects a zero-sized PNG header before decode", async () => {
    const bytes = validPngBytes.slice();
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(16, 0);
    const decode = vi.fn(); vi.stubGlobal("createImageBitmap", decode);
    await expect(validateImportImage(new File([bytes], "empty.png"))).rejects.toThrow("해상도");
    expect(decode).not.toHaveBeenCalled();
  });
});
