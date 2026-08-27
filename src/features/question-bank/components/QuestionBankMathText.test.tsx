import { render, screen } from "@testing-library/react";
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
    const { container } = render(<QuestionBankDetail item={item} onClose={vi.fn()} onOpenQuestion={vi.fn()} />);
    expect(container.querySelectorAll(".math-fragment")).toHaveLength(3);
  });

  it("displays an explicit zero importance score", () => {
    render(<QuestionBankDetail item={{ ...item, classification: { ...item.classification, importanceScore: 0 } }} onClose={vi.fn()} onOpenQuestion={vi.fn()} />);
    expect(screen.getByText("0/5")).toBeInTheDocument();
  });
});

