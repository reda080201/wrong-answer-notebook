import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readZipImport } from "./zipImport";
import {
  createKangdaeK7SyntheticImport,
  getKangdaeK7SyntheticImagePaths,
} from "../../../test/fixtures/kangdaeK7Synthetic";

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

  it("resolves every referenced representation path in the 30/30/11/22 synthetic contract", async () => {
    const zip = new JSZip();
    const importData = createKangdaeK7SyntheticImport();
    const referencedImagePaths = getKangdaeK7SyntheticImagePaths(importData);
    zip.file("import.json", JSON.stringify(importData));
    for (const imagePath of referencedImagePaths) {
      zip.file(imagePath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const result = await readZipImport(new File([blob], "synthetic-k7.zip", { type: "application/zip" }));

    const parsed = JSON.parse(result.jsonText) as typeof importData;
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].questions).toHaveLength(30);
    expect(parsed.entries[0].answerKey).toHaveLength(30);
    expect(parsed.entries[0].figures).toHaveLength(11);
    expect(result.imageAssets).toHaveLength(22);
    expect([...new Set(referencedImagePaths)]).toHaveLength(22);
    expect(result.imageAssets.map((asset) => asset.sourcePath).sort()).toEqual([...referencedImagePaths].sort());
    expect(result.imageFiles).toHaveLength(22);
  });
});
