import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ImportPreviewSummary from "./ImportPreviewSummary";

describe("ImportPreviewSummary", () => {
  it("renders audit metadata without turning review warnings into a save gate", () => {

    render(
      <ImportPreviewSummary
        title="수학 시험지"
        detectedFormat="json"
        questionCount={2}
        imageCount={1}
        figureCount={1}
        answerCount={2}
        hasMemo
        rejectedNotes={["학생 필기"]}
        expectedQuestionNumbers={["1", "2"]}
        validationReport={{
          questionNumbers: ["1", "2"],
          answerNumbers: ["1", "2"],
          issues: [{ id: "audit-handwriting-not-excluded", severity: "warning", message: "손글씨 확인 필요" }],
          audit: {
            expectedQuestionNumbers: ["1", "2"],
            detectedQuestionNumbers: ["1", "2"],
            missingQuestionNumbers: [],
            uncertainQuestionNumbers: ["2"],
            handwritingExcluded: false,
            needsReviewCount: 1,
          },
        }}
        validationPolicy={{
          blocking: [],
          confirmable: [{ id: "audit-handwriting-not-excluded", severity: "warning", message: "손글씨 확인 필요" }],
          other: [],
        }}
        reviewExpanded
      />,
    );

    expect(screen.getByText("AI 판독 감사")).toBeInTheDocument();
    expect(screen.getByText("수학 시험지")).toBeInTheDocument();
    expect(screen.getByText("불확실 문제: 2")).toBeInTheDocument();
    expect(screen.getByText("검토 권장")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
