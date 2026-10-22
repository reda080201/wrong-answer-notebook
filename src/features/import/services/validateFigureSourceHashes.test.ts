import { afterEach, describe, expect, it, vi } from "vitest";
import { validPngBytes } from "../../../test/fixtures/validPng";
import { validateFigureSourceHashes } from "./validateFigureSourceHashes";

describe("diagram source byte identity", () => {
  afterEach(() => vi.unstubAllGlobals());
  const assets = [{ sourcePath: "images/original.png", file: new File([validPngBytes], "original.png", { type: "image/png" }) }];
  const document = (hash: string) => JSON.stringify({ entries: [{ figures: [{ original: { image: "images/original.png" }, cleaned: { image: "cleaned.png", sourceImageHash: hash } }] }] });
  it("checks declared SHA-256 against the actual original bytes", async () => {
    const digest = vi.fn(async (_algorithm: string, bytes: ArrayBuffer) => {
      expect(new Uint8Array(bytes)).toEqual(validPngBytes);
      return new Uint8Array(32).fill(17).buffer;
    });
    vi.stubGlobal("crypto", { subtle: { digest } });
    const hash = "11".repeat(32);
    await expect(validateFigureSourceHashes(document(`sha256:${hash}`), assets)).resolves.toBeUndefined();
    await expect(validateFigureSourceHashes(document("0".repeat(64)), assets)).rejects.toThrow("SHA-256");
  });
  it("rejects absent/case-mismatched source paths", async () => {
    await expect(validateFigureSourceHashes(document("0".repeat(64)), [{ ...assets[0], sourcePath: "images/Original.png" }])).rejects.toThrow("파일이 없습니다");
  });
  it("keeps legacy placeholders unverified without treating them as approval", async () => {
    await expect(validateFigureSourceHashes(document("legacy hash placeholder"), assets)).resolves.toBeUndefined();
  });
});
