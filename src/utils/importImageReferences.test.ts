import { describe, expect, it } from "vitest";
import type { EntryFormData } from "../types";
import { collectEntryImportImageReferences, mapEntryImportImageReferences } from "./importImageReferences";

describe("import image references", () => {
  it("collects nested original, source-page, cleaned, question, and explanation images", () => {
    const entry: Partial<EntryFormData> = {
      questionImages: ["page.png"],
      sourcePageImages: ["source-page.png"],
      figures: [{ id: "f1", questionNumber: "1", title: "", caption: "", image: "preferred.png", source: "original", original: { image: "original.png", sourcePageImage: "source.png" }, cleaned: { image: "cleaned.png", generatedBy: "gpt", generatedAt: "", sourceImageHash: "h", promptVersion: "v" } }],
      explanationParts: [{ id: "e1", text: "", images: ["explanation.png"] }],
      learningBlocks: [{ id: "b1", type: "concept", title: "개념", content: "내용", images: ["block.png"], figureIds: ["f1"] }],
    };
    expect(collectEntryImportImageReferences(entry)).toEqual(["page.png", "source-page.png", "preferred.png", "original.png", "source.png", "cleaned.png", "explanation.png", "block.png"]);
  });

  it("maps every nested reference without mutating the entry", () => {
    const entry: Partial<EntryFormData> = { figures: [{ id: "f1", questionNumber: "1", title: "", caption: "", image: "old.png", source: "original", original: { image: "old.png", sourcePageImage: "page.png" } }] };
    const mapped = mapEntryImportImageReferences(entry, (name) => `saved-${name}`);
    expect(mapped.figures?.[0]).toMatchObject({ image: "saved-old.png", original: { image: "saved-old.png", sourcePageImage: "saved-page.png" } });
    expect(entry.figures?.[0].image).toBe("old.png");
  });
});
