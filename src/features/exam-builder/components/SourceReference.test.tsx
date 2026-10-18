import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import SourceReference from "./SourceReference";
import { SourceNavigationContext } from "./sourceNavigationContext";

it("navigates once without changing the focused exam question first", async () => {
  const navigate = vi.fn(async () => undefined);
  const focusQuestion = vi.fn();
  const source = { sourceEntryId: "sheet", sourceEntryTitle: "원본", sourceQuestionNumber: "2", sourceStatus: "linked" as const };
  render(<SourceNavigationContext.Provider value={navigate}><div onFocus={focusQuestion}><SourceReference source={source} /></div></SourceNavigationContext.Provider>);
  const button = screen.getByRole("button", { name: "원본 · 원문 2번" });
  fireEvent.focus(button);
  fireEvent.click(button);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(source));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(focusQuestion).not.toHaveBeenCalled();
});
