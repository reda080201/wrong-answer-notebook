import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { QuestionBankItem } from "../model/questionBankTypes";
import SimilarQuestionLinksPanel from "./SimilarQuestionLinksPanel";

const source = { id: "source", entryKind: "lecture", title: "미분 특강", subject: "수학", question: "", questionImages: [], difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], createdAt: "", updatedAt: "", learningBlocks: [] } as never;
const block = { id: "block", type: "concept", title: "도함수", content: "", unit: "미분", relatedConcepts: ["도함수"] } as never;
const item: QuestionBankItem = { id: "target:1", entryId: "target", entryTitle: "기출", entryKind: "problem_sheet", questionNumber: "1", subject: "수학", questionText: "도함수 문제", source: { type: "unknown" }, classification: { subject: "수학", sourceType: "unknown", unit: "미분", concepts: ["도함수"], answerType: "unknown", isPastExam: false }, questionImages: [], sourcePageImages: [], hasAnswer: false, hasExplanation: false, hasImages: false, isWrong: false, isMastered: false, reviewDue: false, updatedAt: "" };

describe("SimilarQuestionLinksPanel", () => {
  it("keeps the existing links and offers retry after a save failure", async () => {
    const onChange = vi.fn().mockRejectedValue(new Error("disk"));
    render(<SimilarQuestionLinksPanel sourceEntry={source} block={block} links={[]} items={[item]} onOpen={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "유사 문제 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "연결" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("관련 문제 연결을 저장하지 못했습니다."));
    expect(screen.getByRole("button", { name: "다시 저장" })).toBeInTheDocument();
  });
});
