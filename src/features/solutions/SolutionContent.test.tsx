import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SolutionContent from "./SolutionContent";
import type { SheetAnswerItem, SheetFigureItem } from "../../types";

const figures: SheetFigureItem[] = [{ id: "body-only", questionNumber: "1", title: "본문 그림", caption: "본문 자료", source: "described_only" },
  { id: "solution", questionNumber: "2", title: "해설 그림", caption: "해설 자료", source: "described_only" }];
const answer: SheetAnswerItem = { id: "answer", questionNumber: "2", answer: "6", explanation: "1+2+3=6입니다.", importantPoints: [] };
describe("solution figure scope", () => {
  it("does not warn about body-only or other-section figures", () => {
    render(<SolutionContent answer={{ ...answer, steps: ["[FIGURE:solution]", "계산한다."] }} figures={figures} />);
    expect(screen.queryByText(/그림 위치 연결 확인 필요/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/해설 자료/)).toHaveLength(1);
  });
  it("retains warnings for actual missing and malformed references", () => {
    render(<SolutionContent answer={{ ...answer, explanation: "[FIGURE:missing] [FIGURE:]" }} figures={figures} />);
    expect(screen.getByText(/missing/)).toBeInTheDocument();
    expect(screen.queryByText(/body-only/)).not.toBeInTheDocument();
  });
});
