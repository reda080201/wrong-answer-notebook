import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { ExamSession } from "../types";
import ExamSessionOverlay from "./ExamSessionOverlay";
import { setSavedRealExamProtection } from "../features/exam/services/realExamProtection";

vi.mock("../features/exam/components/RealExamSessionView", () => ({ default: () => <p>실전 화면</p> }));
vi.mock("../features/exam/components/ExamSessionView", () => ({ default: () => <p>연습·채점 해설</p> }));
const real = { id: "live", entryId: "source", mode: "real", status: "in_progress", questions: [] } as unknown as ExamSession;
const props = (session: ExamSession) => ({ session, generated: false, onClose: vi.fn() } as unknown as ComponentProps<typeof ExamSessionOverlay>);
afterEach(() => { act(() => setSavedRealExamProtection([])); });

it.each(["practice", "real"] as const)("blocks a prior submitted %s result for the protected source", mode => {
  setSavedRealExamProtection([real]);
  render(<ExamSessionOverlay {...props({ ...real, id: "old", mode, status: "submitted" })} />);
  expect(screen.getByRole("dialog", { name: "실전 시험 자료 보호" })).toBeVisible();
  expect(screen.queryByText("연습·채점 해설")).not.toBeInTheDocument();
  expect(screen.queryByText("실전 화면")).not.toBeInTheDocument();
});
it("keeps the ongoing real exam accessible and releases other views after submission", () => {
  setSavedRealExamProtection([real]);
  const view = render(<ExamSessionOverlay {...props(real)} />);
  expect(screen.getByText("실전 화면")).toBeVisible();
  act(() => setSavedRealExamProtection([{ ...real, status: "submitted" }]));
  view.rerender(<ExamSessionOverlay {...props({ ...real, mode: "practice", status: "submitted" })} />);
  expect(screen.getByText("연습·채점 해설")).toBeVisible();
});
