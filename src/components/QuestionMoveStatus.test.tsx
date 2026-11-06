import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import QuestionMoveStatus from "./QuestionMoveStatus";
it("announces only actual moves in the same entry using the source label", () => {
  const { rerender } = render(<QuestionMoveStatus entryId="a" label="13" index={0} total={3} />);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  rerender(<QuestionMoveStatus entryId="a" label="27" index={1} total={3} />);
  expect(screen.getByRole("status")).toHaveTextContent("문제 27번으로 이동했습니다. 전체 3문항 중 2번째");
  rerender(<QuestionMoveStatus entryId="b" label="1" index={0} total={3} />);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});
it("suppresses a background move under a modal without announcing it later", () => {
  const view = (index: number, modal: boolean) => <><QuestionMoveStatus entryId="a" label={String(index + 1)} index={index} total={3} />{modal && <div role="dialog" aria-modal="true">해설</div>}</>;
  const { rerender } = render(view(0, false));
  rerender(view(1, true));
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  rerender(view(1, false));
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  rerender(view(2, false));
  expect(screen.getByRole("status")).toHaveTextContent("문제 3번");
});
