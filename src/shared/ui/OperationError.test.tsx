import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

it.each(["401", "403", "429", "503"])("explains explicit HTTP %s while preserving technical details", (status) => {
  const message = `AI 제공자 오류 ${status} from model`;
  render(<OperationError message={message} />);
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(operationErrorSummary(message)).not.toBe(message);
  expect(screen.getByText("기술 정보")).toBeInTheDocument();
});
it("does not treat a question number as an HTTP error", () => {
  expect(operationErrorSummary("문항 429의 답안을 확인하세요")).toBe("문항 429의 답안을 확인하세요");
});
import OperationError, { operationErrorSummary } from "./OperationError";

it("keeps specific validation and partial-save information intact", () => {
  const message = "항목은 저장됐지만 일부 이미지 정리에 실패했습니다.";
  expect(operationErrorSummary(message)).toBe(message);
});
it("explains recognized connection failures without blaming API credentials", () => {
  render(<OperationError message="Failed to fetch" />);
  expect(screen.getByRole("alert")).toHaveTextContent("연결을 완료하지 못했습니다");
  expect(screen.getByText("기술 정보")).toBeInTheDocument();
  expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
  expect(screen.queryByText(/API 키/)).not.toBeInTheDocument();
});
