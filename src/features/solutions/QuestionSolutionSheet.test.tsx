import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QuestionSolutionSheet from "./QuestionSolutionSheet";
import Dialog from "../../shared/ui/Dialog";

const questions = [1, 2, 3].map(number => ({ key: String(number), number: String(number), figures: [] }));
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
function Harness({ removeOriginal = false, nested = false, noCurrentDot = false }) {
  const [key, setKey] = useState("1");
  const [open, setOpen] = useState(false);
  return <section className="original-page-reader">
    <div className="original-page-viewport" tabIndex={0} aria-label="original page">
      {(!removeOriginal || key === "1") && <button onClick={() => setOpen(true)}>original dot</button>}
      {key !== "1" && !noCurrentDot && <button data-solution-question-key={key}>current dot</button>}
    </div>
    {open && <QuestionSolutionSheet questions={questions} questionKey={key} onNavigate={setKey} onClose={() => setOpen(false)} />}
    {open && nested && <Dialog open onClose={() => {}} ariaLabel="nested"><input aria-label="nested input" /></Dialog>}
  </section>;
}
describe("solution sheet focus ownership", () => {
  it("keeps focus and arrow navigation at both disabled boundaries", async () => {
    render(<Harness />);
    screen.getByText("original dot").focus(); fireEvent.click(screen.getByText("original dot"));
    await waitFor(() => expect(screen.getByLabelText("해설창 전체 높이로 확대")).toHaveFocus());
    const next = screen.getByRole("button", { name: "다음 문항 해설" });
    next.focus(); fireEvent.click(next); fireEvent.click(next);
    expect(next).toBeDisabled();
    expect(screen.getByRole("dialog", { name: "정답·해설 3번" })).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(screen.getByRole("dialog", { name: "정답·해설 2번" })).toBeVisible();
    const previous = screen.getByRole("button", { name: "이전 문항 해설" });
    previous.focus(); fireEvent.click(previous);
    expect(previous).toBeDisabled();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(screen.getByRole("dialog", { name: "정답·해설 2번" })).toBeVisible();
  });
  it.each([false, true])("returns to the current dot or page after the opener unmounts (%s)", async noCurrentDot => {
    render(<Harness removeOriginal noCurrentDot={noCurrentDot} />);
    screen.getByText("original dot").focus(); fireEvent.click(screen.getByText("original dot"));
    await waitFor(() => expect(screen.getByLabelText("해설창 전체 높이로 확대")).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "다음 문항 해설" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(noCurrentDot ? screen.getByLabelText("original page") : screen.getByText("current dot")).toHaveFocus());
  });
  it("does not capture a nested dialog's direction keys", async () => {
    render(<Harness nested />);
    fireEvent.click(screen.getByText("original dot"));
    const input = screen.getByLabelText("nested input");
    input.focus(); fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(document.querySelector('[role="dialog"][aria-label="정답·해설 1번"]')).toBeInTheDocument();
  });
});
