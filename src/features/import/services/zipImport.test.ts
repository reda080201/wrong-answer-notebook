import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readZipImport } from "./zipImport";
import { createKangdaeK7SyntheticImport } from "../../../test/fixtures/kangdaeK7Synthetic";

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

  it("keeps all synthetic K7 source paths while extracting the 22 identity PNG assets", async () => {
    const zip = new JSZip();
    zip.file("import.json", JSON.stringify(createKangdaeK7SyntheticImport()));
    for (let index = 1; index <= 22; index += 1) {
      zip.file(`images/identity-${index}.png`, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const result = await readZipImport(new File([blob], "synthetic-k7.zip", { type: "application/zip" }));

    expect(result.imageAssets).toHaveLength(22);
    expect(result.imageAssets.map((asset) => asset.sourcePath)).toContain("images/identity-22.png");
    expect(result.imageFiles).toHaveLength(22);
  });
});
