import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImportPreviewSummary from "./ImportPreviewSummary";

describe("ImportPreviewSummary", () => {
  it("renders audit metadata and reports warning confirmation", () => {
    const onConfirmedWarningsChange = vi.fn();

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
        confirmedWarnings={false}
        onConfirmedWarningsChange={onConfirmedWarningsChange}
      />,
    );

    expect(screen.getByText("AI 판독 감사")).toBeInTheDocument();
    expect(screen.getByText("수학 시험지")).toBeInTheDocument();
    expect(screen.getByText("불확실 문제: 2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("손글씨/도표 연결 위험 항목을 확인했습니다."));
    expect(onConfirmedWarningsChange).toHaveBeenCalledWith(true);
  });
});
