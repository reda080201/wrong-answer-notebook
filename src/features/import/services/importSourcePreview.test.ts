import { describe, expect, it } from "vitest";
import type { SheetFigureItem, StructuredQuestion } from "../../../types";
import { importSourcePreview } from "./importSourcePreview";
const question: StructuredQuestion = { questionNumber: "1", questionText: "문제", choices: [], conditions: [], equations: [], contentSegments: [], figureIds: [], source: { page: 2 } };
const figure: SheetFigureItem = { id: "f", questionNumber: "1", title: "", caption: "", source: "gpt_cleaned", image: "candidate.png", original: { image: "crop.png", sourcePageImage: "page2.png" }, cleaned: { image: "candidate.png", generatedAt: "", sourceImageHash: "", promptVersion: "" } };
describe("import original preview", () => {
  it("includes the linked page and original crop once, never the selected candidate or unrelated pages", () => {
    expect(importSourcePreview(question, { structuredQuestions: [question], sourcePageImages: ["page1.png", "page2.png"], figures: [figure] }).images).toEqual(["page2.png", "crop.png"]);
  });
  it("does not infer a page from order or an invalid page number", () => {
    expect(importSourcePreview({ ...question, source: { page: 3 } }, { structuredQuestions: [question], sourcePageImages: ["page1.png"] }).images).toEqual([]);
  });
  it("does not use normalized duplicate numbers to attach figures", () => {
    const result = importSourcePreview({ ...question, source: undefined }, { structuredQuestions: [question, { ...question, questionNumber: "01번" }], figures: [figure] });
    expect(result.images).toEqual([]); expect(result.ambiguous).toBe(true);
  });
  it("allows unique explicit figure IDs even when question numbers repeat", () => {
    expect(importSourcePreview({ ...question, source: undefined, figureIds: ["f"] }, { structuredQuestions: [question, question], figures: [figure] }).images).toEqual(["page2.png", "crop.png"]);
  });
  it("does not pick a basename when multiple paths match the reference", () => {
    expect(importSourcePreview({ ...question, source: { reference: "page.png" } }, { structuredQuestions: [question], sourcePageImages: ["a/page.png", "b/page.png"] })).toEqual({ images: [], ambiguous: true });
  });
});
