import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readZipImport } from "./zipImport";

describe("readZipImport asset names", () => {
  it("rejects duplicate normalized image basenames before extraction", async () => {
    const zip = new JSZip();
    zip.file("import.json", "{}");
    zip.file("round1/Graph.png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    zip.file("round2/graph.png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    const blob = await zip.generateAsync({ type: "blob" });
    await expect(readZipImport(new File([blob], "bundle.zip", { type: "application/zip" })))
      .rejects.toThrow("중복된 이미지 파일명이 있습니다");
  });
});
