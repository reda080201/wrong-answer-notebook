import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import ExamPrintQuestion from "./ExamPrintQuestion";
import type { ExamPrintQuestionModel } from "../types";

it("prints explicit repeated body/choice references in place with the user's image choice", () => {
  const question: ExamPrintQuestionModel = { questionNumber: "1", displayNumber: "1", kind: "objective", workspaceSize: "none", choices: ["① before [FIGURE:f] after"], segments: [{ id: "before", type: "text", text: "body before" }, { id: "figure", type: "figure", figureId: "f" }, { id: "after", type: "text", text: "body after" }], figures: [{ id: "f", questionNumber: "1", title: "diagram", caption: "", source: "original", original: { image: "original.png" }, cleaned: { image: "cleaned.png", generatedAt: "", sourceImageHash: "", promptVersion: "v7" }, preferredRepresentation: "cleaned", representationSelectionSource: "user" }] };
  const { container } = render(<ExamPrintQuestion question={question} imageUrls={{ "original.png": "blob:original", "cleaned.png": "blob:cleaned" }} workspaceSize="none" />);
  expect(screen.getAllByRole("img")).toHaveLength(2);
  screen.getAllByRole("img").forEach(image => expect(image).toHaveAttribute("src", "blob:cleaned"));
  expect(container.querySelector(".exam-print-choices li img")).not.toBeNull();
  expect(container.textContent).not.toContain("[FIGURE:");
  const children = [...container.querySelector(".exam-print-question")!.children];
  expect(children.findIndex(child => child.className === "exam-print-figure")).toBeGreaterThan(children.findIndex(child => child.textContent === "body before"));
  expect(children.findIndex(child => child.className === "exam-print-figure")).toBeLessThan(children.findIndex(child => child.textContent === "body after"));
});

it("warns about an unplaced figure instead of appending its image", () => {
  const question: ExamPrintQuestionModel = { questionNumber: "1", displayNumber: "1", kind: "subjective", workspaceSize: "none", choices: [], segments: [{ id: "t", type: "text", text: "body" }], figures: [{ id: "loose", questionNumber: "1", title: "loose", caption: "", source: "original", image: "original.png" }] };
  render(<ExamPrintQuestion question={question} imageUrls={{ "original.png": "blob:original" }} workspaceSize="none" />);
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText(/그림 위치 연결 확인 필요/)).toBeVisible();
});
