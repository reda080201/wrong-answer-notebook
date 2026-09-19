import { describe, expect, it } from "vitest";
import type { StructuredQuestion } from "../types";
import { getEntryImportReviewSummary, normalizeImportAudit, scrubRejectedNotesFromStructuredQuestions } from "./importAudit";

function question(overrides: Partial<StructuredQuestion> = {}): StructuredQuestion {
  return {
    questionNumber: "1",
    questionText: "문제 본문",
    conditions: ["손글씨 조건"],
    equations: ["x = 손글씨"],
    choices: ["① 손글씨 선택지"],
    contentSegments: [
      { id: "segment-1", type: "text", text: "손글씨 본문" },
      { id: "segment-2", type: "table", rows: [["손글씨 표"]] },
    ],
    figureIds: ["figure-1"],
    ...overrides,
  };
}

describe("import audit structured questions", () => {
  it("deduplicates question review counts from missing, uncertain, and aggregate audit values", () => {
    const summary = getEntryImportReviewSummary({
      importAudit: {
        expectedQuestionNumbers: ["1", "2"],
        detectedQuestionNumbers: [],
        missingQuestionNumbers: ["1"],
        uncertainQuestionNumbers: ["2"],
        needsReviewCount: 2,
      },
    });

    expect(summary.questionReviewCount).toBe(2);
    expect(summary.additionalAuditCount).toBe(0);
    expect(summary.auditIssueCount).toBe(2);
  });

  it("keeps non-question checks separate and preserves rejected-note guidance", () => {
    const summary = getEntryImportReviewSummary({
      importAudit: { expectedQuestionNumbers: [], detectedQuestionNumbers: [], missingQuestionNumbers: [], uncertainQuestionNumbers: [], needsReviewCount: 0, handwritingExcluded: false },
      rejectedNotes: ["필기"],
    });
    expect(summary.questionReviewCount).toBe(0);
    expect(summary.additionalAuditCount).toBe(1);
    expect(summary.rejectedNoteCount).toBe(1);
    expect(summary.hasAuditIssue).toBe(true);
  });

  it("compares expected audit numbers with canonical structured numbers", () => {
    const audit = normalizeImportAudit({ expectedQuestionNumbers: ["1", "2"], detectedQuestionNumbers: ["2"] }, {
      question: "1. 호환 본문\n\n2. 호환 본문",
      structuredQuestions: [question()],
    });

    expect(audit.detectedQuestionNumbers).toEqual(["1"]);
    expect(audit.missingQuestionNumbers).toEqual(["2"]);
  });

  it("scrubs structured fields without dropping question or segment IDs", () => {
    const [scrubbed] = scrubRejectedNotesFromStructuredQuestions([question({
      questionNumber: "7",
      questionType: "multiple_choice",
      contentSegments: [
        { id: "keep-text-id", type: "text", text: "손글씨" },
        { id: "keep-figure-id", type: "figure", figureId: "figure-1" },
      ],
      choices: ["손글씨"],
    })], ["손글씨"]);

    expect(scrubbed).toMatchObject({
      questionNumber: "7",
      contentSegments: [
        { id: "keep-text-id", type: "text", text: "" },
        { id: "keep-figure-id", type: "figure", figureId: "figure-1" },
      ],
      figureIds: ["figure-1"],
      choices: [],
      needsReview: true,
      warning: expect.stringContaining("선택지"),
    });
  });
});
