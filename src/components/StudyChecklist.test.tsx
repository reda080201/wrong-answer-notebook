import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import StudyChecklist from "./StudyChecklist";
it("blocks duplicate writes and preserves checked state after failure", async () => {
  let fail!: (reason: Error) => void;
  const save = vi.fn(() => new Promise<void>((_, reject) => { fail = reject; }));
  render(<StudyChecklist items={[{ id: "one", text: "조건 확인", checked: false }]} onChange={save} />);
  const input = screen.getByRole("checkbox");
  fireEvent.click(input); fireEvent.click(input);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith([{ id: "one", text: "조건 확인", checked: true }]);
  fail(new Error("저장 실패"));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("저장 실패"));
  expect(input).not.toBeChecked();
  expect(input).toBeEnabled();
});
