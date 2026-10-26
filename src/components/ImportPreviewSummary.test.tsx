import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ImportPreviewSummary from "./ImportPreviewSummary";

describe("ImportPreviewSummary", () => {
  it("exposes every blocking reason beyond the first six and updates the remaining count", () => {
    const issues = Array.from({ length: 9 }, (_, index) => ({ id: `error-${index}`, severity: "error" as const, message: `저장 차단 사유 ${index + 1}` }));
    const props = { questionCount: 1, imageCount: 0, figureCount: 0, answerCount: 0, hasMemo: false, rejectedNotes: [], expectedQuestionNumbers: [], reviewExpanded: true,
      validationReport: { questionNumbers: [], answerNumbers: [], issues }, validationPolicy: { blocking: issues, confirmable: [], other: [] } };
    const { rerender } = render(<ImportPreviewSummary {...props} />);
    const list = screen.getByLabelText("적용 불가 목록");
    expect(within(list).getByText("저장 차단 사유 9")).not.toBeVisible();
    fireEvent.click(within(list).getByText("나머지 3개 보기"));
    expect(within(list).getByText("저장 차단 사유 9")).toBeVisible();
    const remaining = issues.slice(6);
    rerender(<ImportPreviewSummary {...props} validationReport={{ ...props.validationReport, issues: remaining }} validationPolicy={{ blocking: remaining, confirmable: [], other: [] }} />);
    expect(screen.getByText("적용 불가 · 안내 3건")).toBeVisible();
    expect(screen.queryByText(/나머지 .*개 보기/)).not.toBeInTheDocument();
    expect(screen.getByText("저장 차단 사유 9")).toBeVisible();
  });
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

    expect(screen.getByText("가져오기 확인 요약")).toBeInTheDocument();
    expect(screen.getByText("수학 시험지")).toBeInTheDocument();
    expect(screen.getByText("확인 필요 문항: 2")).toBeInTheDocument();
    expect(screen.getByText("검토 권장")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
