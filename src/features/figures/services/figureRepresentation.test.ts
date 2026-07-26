import { describe, expect, it } from "vitest";
import type { SheetFigureItem } from "../../../types";
import { applyAutomaticFigurePreference, resolveFigureRepresentation, shouldReuseCleanedFigure, verifySemanticSpecAgainstText } from "./figureRepresentation";

function figure(partial: Partial<SheetFigureItem> = {}): SheetFigureItem {
  return {
    id: "f1",
    questionNumber: "1",
    title: "도형",
    caption: "",
    image: "legacy.png",
    source: "original",
    original: { image: "original.png" },
    cleaned: { image: "cleaned.png", generatedBy: "gpt", generatedAt: "2026-07-24T00:00:00Z", sourceImageHash: "hash", promptVersion: "figure-clean-v1" },
    ...partial,
  };
}

describe("figure representation policy", () => {
  it("uses a highly verified cleaned image by default", () => {
    const item = figure({ verification: { status: "verified", confidence: 0.97, checks: {}, blockingIssues: [], warnings: [] } });
    expect(resolveFigureRepresentation(item)).toMatchObject({ kind: "cleaned", image: "cleaned.png", needsReview: false });
  });

  it("falls back to the original image until a cleaned image is verified", () => {
    const item = figure({ verification: { status: "needs_review", confidence: 0.85, checks: {}, blockingIssues: [], warnings: [] } });
    expect(resolveFigureRepresentation(item)).toMatchObject({ kind: "original", image: "original.png", needsReview: false });
    expect(resolveFigureRepresentation(item, { forPrint: true })).toMatchObject({ kind: "original", image: "original.png" });
  });

  it("uses the original when verification has a blocking issue", () => {
    const item = figure({ verification: { status: "rejected", confidence: 0.99, checks: {}, blockingIssues: [{ type: "wrong_label", message: "P 라벨 누락" }], warnings: [] } });
    expect(resolveFigureRepresentation(item)).toMatchObject({ kind: "original", image: "original.png" });
  });

  it("does not overwrite a user-approved cleaned selection", () => {
    const item = figure({ preferredRepresentation: "cleaned", representationSelectionSource: "user", verification: { status: "needs_review", confidence: 0.5, checks: {}, blockingIssues: [], warnings: [], userApproved: true } });
    expect(applyAutomaticFigurePreference(item)).toBe(item);
    expect(resolveFigureRepresentation(item, { forPrint: true }).kind).toBe("cleaned");
  });

  it("reuses a cleaned asset only for the same source hash and prompt version", () => {
    const item = figure();
    expect(shouldReuseCleanedFigure(item, "hash")).toBe(true);
    expect(shouldReuseCleanedFigure(item, "changed")).toBe(false);
  });

  it("warns when text relations are missing from the semantic spec", () => {
    const warnings = verifySemanticSpecAgainstText({ type: "plane_geometry", relations: [] }, "OP ⊥ AB이고 P는 중점이다.");
    expect(warnings.map((item) => item.type)).toEqual(["text_figure_conflict", "text_figure_conflict"]);
  });
});
