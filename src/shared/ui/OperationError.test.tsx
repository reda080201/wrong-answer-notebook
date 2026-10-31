import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
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
