import { describe, expect, it } from "vitest";
import type { EntryFormData } from "../types";
import { collectEntryImportImageReferences, mapEntryImportImageReferences } from "./importImageReferences";

describe("import image references", () => {
  it("collects nested original, source-page, cleaned, question, and explanation images", () => {
    const entry: Partial<EntryFormData> = {
      questionImages: ["page.png"],
      sourcePageImages: ["source-page.png"],
      questionSourceCrops: [{ id: "crop-1", questionNumber: "1", order: 0, image: "crop.png", sourcePageImage: "source-page.png" }],
      figures: [{ id: "f1", questionNumber: "1", title: "", caption: "", image: "preferred.png", source: "original", original: { image: "original.png", sourcePageImage: "source.png" }, cleaned: { image: "cleaned.png", generatedBy: "gpt", generatedAt: "", sourceImageHash: "h", promptVersion: "v" } }],
      explanationParts: [{ id: "e1", text: "", images: ["explanation.png"] }],
      learningBlocks: [{ id: "b1", type: "concept", title: "개념", content: "내용", images: ["block.png"], figureIds: ["f1"] }],
      supplementalResources: [{ id: "r1", kind: "source_pages", title: "원본", createdAt: "2026-01-01", updatedAt: "2026-01-01", images: ["supplemental.png"] }],
    };
    expect(collectEntryImportImageReferences(entry)).toEqual(["page.png", "source-page.png", "crop.png", "source-page.png", "preferred.png", "original.png", "source.png", "cleaned.png", "explanation.png", "block.png", "supplemental.png"]);
  });

  it("maps every nested reference without mutating the entry", () => {
    const entry: Partial<EntryFormData> = { questionSourceCrops: [{ id: "crop-1", questionNumber: "1", order: 0, image: "crop.png", sourcePageImage: "page.png" }], figures: [{ id: "f1", questionNumber: "1", title: "", caption: "", image: "old.png", source: "original", original: { image: "old.png", sourcePageImage: "page.png" } }] };
    const mapped = mapEntryImportImageReferences(entry, (name) => `saved-${name}`);
    expect(mapped.figures?.[0]).toMatchObject({ image: "saved-old.png", original: { image: "saved-old.png", sourcePageImage: "saved-page.png" } });
    expect(mapped.questionSourceCrops?.[0]).toMatchObject({ image: "saved-crop.png", sourcePageImage: "saved-page.png" });
    expect(entry.figures?.[0].image).toBe("old.png");
  });

  it("removes unmapped nested references when an import cannot resolve an asset", () => {
    const entry: Partial<EntryFormData> = {
      figures: [{
        id: "f1",
        questionNumber: "1",
        title: "",
        caption: "",
        image: "missing.png",
        source: "original",
        original: { image: "missing.png", sourcePageImage: "missing-page.png" },
        cleaned: { image: "cleaned.png", generatedBy: "gpt", generatedAt: "", sourceImageHash: "h", promptVersion: "v" },
      }],
      learningBlocks: [{ id: "b1", type: "concept", title: "", content: "", images: ["missing-block.png"] }],
    };

    const mapped = mapEntryImportImageReferences(entry, () => undefined, { removeUnmapped: true });
    expect(mapped.figures?.[0]).toMatchObject({ image: undefined, original: undefined, cleaned: undefined });
    expect(mapped.learningBlocks?.[0]?.images).toEqual([]);
  });
});
