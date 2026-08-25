import { describe, expect, it } from "vitest";
import type { EntryFormData, StructuredQuestion } from "../types";
import { classifyImportValidationIssues, validateImportedStudyData } from "./importValidation";

function structuredQuestion(overrides: Partial<StructuredQuestion> = {}): StructuredQuestion {
  return {
    questionNumber: "1",
    questionText: "문제 본문",
    conditions: [],
    equations: [],
    choices: [],
    contentSegments: [],
    figureIds: [],
    ...overrides,
  };
}

function importedData(overrides: Partial<EntryFormData> = {}): Partial<EntryFormData> {
  return {
    question: "호환 본문",
    structuredQuestions: [structuredQuestion()],
    answerKey: [],
    ...overrides,
  };
}

describe("structured import validation", () => {
  it("blocks normalized duplicate structured question numbers", () => {
    const report = validateImportedStudyData(importedData({
      structuredQuestions: [
        structuredQuestion({ questionNumber: "01" }),
        structuredQuestion({ questionNumber: "1번", questionText: "중복 문항" }),
      ],
    }));

    const issue = report.issues.find((item) => item.id === "duplicate-question-1");
    expect(issue).toMatchObject({ severity: "error" });
    expect(classifyImportValidationIssues(report).blocking).toContainEqual(issue);
  });

  it("reports malformed structured items with an indexed blocking issue", () => {
    const report = validateImportedStudyData(importedData({
      structuredQuestions: [structuredQuestion(), null as never],
    }));

    expect(report.issues).toContainEqual(expect.objectContaining({
      id: "structured-question-1-malformed",
      severity: "error",
      message: expect.stringContaining("structuredQuestions[1]"),
    }));
  });

  it("checks rejected-note leaks across structured fields", () => {
    const report = validateImportedStudyData(importedData({
      rejectedNotes: ["손글씨 조건 변환"],
      structuredQuestions: [structuredQuestion({
        conditions: ["손글씨 조건 변환"],
        contentSegments: [{ id: "segment-1", type: "text", text: "본문" }],
      })],
    }));

    expect(report.issues).toContainEqual(expect.objectContaining({
      id: "rejected-note-possible-leak",
      severity: "error",
    }));
  });

  it("blocks invalid normalized source and figure crops without clamping", () => {
    const report = validateImportedStudyData(importedData({
      questionSourceCrops: [{ questionNumber: "1", image: "crop.png", cropRect: { x: 0.8, y: 0, width: 0.4, height: 0.5 } }],
      figures: [{ id: "figure-1", questionNumber: "1", title: "도형", caption: "", source: "original", original: { image: "original.png", crop: { x: -0.1, y: 0, width: 0.5, height: 0.5 } } }],
    }));

    expect(report.issues.filter((item) => item.id.startsWith("invalid-crop-"))).toHaveLength(2);
    expect(classifyImportValidationIssues(report).blocking).toHaveLength(2);
  });
});
