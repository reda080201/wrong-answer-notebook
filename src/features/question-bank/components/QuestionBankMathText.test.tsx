import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { QuestionBankItem } from "../model/questionBankTypes";
import QuestionBankCard from "./QuestionBankCard";
import QuestionBankDetail from "./QuestionBankDetail";

const item: QuestionBankItem = {
  id: "entry:1",
  entryId: "entry",
  entryTitle: "수학 문제",
  entryKind: "problem_sheet",
  questionNumber: "1",
  subject: "수학",
  questionText: "문제 /frac{1}{2}",
  source: { type: "unknown" },
  classification: { subject: "수학", sourceType: "unknown", answerType: "unknown", isPastExam: false },
  answer: "/sqrt{x}",
  explanation: "풀이 /sin x",
  questionImages: [],
  sourcePageImages: [],
  hasAnswer: true,
  hasExplanation: true,
  hasImages: false,
  isWrong: false,
  isMastered: false,
  reviewDue: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Question Bank math rendering", () => {
  it("renders card candidate text through MathText", () => {
    const { container } = render(<QuestionBankCard item={item} onOpen={vi.fn()} onInspect={vi.fn()} />);
    expect(container.querySelectorAll(".math-fragment")).toHaveLength(1);
  });

  it("renders question, answer, and explanation through MathText in detail", () => {
    render(<QuestionBankDetail item={item} onClose={vi.fn()} onOpenQuestion={vi.fn()} />);
    expect(document.body.querySelectorAll(".math-fragment")).toHaveLength(3);
  });

  it("renders mixed valid and invalid math without dropping the row text", () => {
    const mixed = { ...item, questionText: "앞 $$x^2$$ 중간 $$깨진 수식 뒤" };
    const { container } = render(<QuestionBankCard item={mixed} onOpen={vi.fn()} onInspect={vi.fn()} />);
    expect(container.querySelector(".katex")).toBeInTheDocument();
    expect(container.querySelector(".math-fragment--invalid")).toBeInTheDocument();
    expect(container.textContent).toContain("앞 ");
    expect(container.textContent).toContain(" 중간 ");
    expect(container.textContent).toContain("수식 형식 확인 필요");
    expect(container.textContent).not.toContain("$$깨진 수식 뒤");
  });
});

