import { describe, expect, it } from "vitest";
import { parseAllInOneImport } from "../../../utils/importStudyText";
import { normalizeEntry } from "../../../utils/entry";
import { resolveFigureRepresentation } from "./figureRepresentation";
import type { WrongAnswerEntry } from "../../../types";

describe("external diagram candidates", () => {
  it.each(["second_pass_model", "machine_checked", "local_validator", "user", "gpt_self_check"])("never adopts an external %s claim", (verificationSource) => {
    const imported = parseAllInOneImport(JSON.stringify({ entryKind: "problem_sheet", question: "1. [FIGURE:f]", figures: [{ id: "f", questionNumber: "1", title: "graph", caption: "", source: "gpt_cleaned", image: "cleaned.png", original: { image: "original.png" }, cleaned: { image: "cleaned.png", generatedBy: "gpt", generatedAt: "", sourceImageHash: "", promptVersion: "v7" }, preferredRepresentation: "cleaned", processingStatus: "ready", semanticSpec: { type: "function_graph" }, verification: { status: "verified", confidence: 1, verificationSource, userApproved: true, checks: { topologyMatch: true, visualLayoutPreserved: true }, blockingIssues: [], warnings: [] } }] }), "import.json");
    const figure = imported.entries[0].figures![0];
    expect(resolveFigureRepresentation(figure)).toMatchObject({ kind: "original", image: "original.png", needsReview: true });
    expect(figure.verification?.userApproved).toBe(false);
  });

  it("keeps an actual in-app choice through persisted-load normalization", () => {
    const entry = normalizeEntry({ id: "saved", entryKind: "problem_sheet", question: "1. [FIGURE:f]", figures: [{ id: "f", questionNumber: "1", title: "graph", caption: "", source: "original", original: { image: "original.png" }, cleaned: { image: "cleaned.png", generatedBy: "gpt", generatedAt: "", sourceImageHash: "", promptVersion: "v7" }, preferredRepresentation: "cleaned", representationSelectionSource: "user", verification: { status: "needs_review", confidence: 0, verificationSource: "user", userApproved: true, checks: {}, blockingIssues: [], warnings: [] } }] } as unknown as WrongAnswerEntry);
    expect(resolveFigureRepresentation(entry.figures![0], { forPrint: true }).image).toBe("cleaned.png");
  });
});
