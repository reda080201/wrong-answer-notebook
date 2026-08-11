import { describe, expect, it } from "vitest";
import type { StructuredQuestion } from "../types";
import {
  applyCompatibilityTextToStructuredQuestions,
  getEntryQuestions,
  renderStructuredQuestionsCompatibilityText,
} from "./entryQuestions";

const questions: StructuredQuestion[] = [{
  questionNumber: "4",
  questionText: "원래 본문",
  conditions: ["조건: x > 0"],
  equations: [],
  choices: ["① 1", "② 2"],
  contentSegments: [
    { id: "segment-q4-1", type: "text", text: "원래 본문" },
    { id: "figure-q4", type: "figure", figureId: "fig-4" },
    { id: "segment-q4-2", type: "condition", label: "조건", text: "조건: x > 0" },
  ],
  figureIds: ["fig-4"],
}];

describe("applyCompatibilityTextToStructuredQuestions", () => {
  it("updates the canonical question and choices while retaining figure placement identity", () => {
    const updated = applyCompatibilityTextToStructuredQuestions(
      questions,
      "4. 수정한 본문\n조건: y > 0\n① 3\n② 4",
    );
    expect(updated).not.toBeNull();
    expect(updated![0].questionText).toContain("수정한 본문");
    expect(updated![0].choices).toEqual(["① 3", "② 4"]);
    expect(updated![0].contentSegments.map((segment) => segment.id)).toEqual([
      "segment-q4-1", "figure-q4", "segment-q4-2",
    ]);
    expect(getEntryQuestions({ question: "", structuredQuestions: updated!, questionContentSegments: undefined })[0]).toEqual(expect.objectContaining({
      questionText: expect.stringContaining("수정한 본문"),
      choices: ["① 3", "② 4"],
    }));
  });

  it("rejects reviewed text when it no longer has the same question-number set", () => {
    expect(applyCompatibilityTextToStructuredQuestions(questions, "5. 다른 번호\n① 1")).toBeNull();
  });

  it("keeps the compatibility projection deterministic", () => {
    expect(renderStructuredQuestionsCompatibilityText(questions)).toContain("4. 원래 본문");
  });
});
