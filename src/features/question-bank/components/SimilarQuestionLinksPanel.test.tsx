import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuestionBankItem } from "../model/questionBankTypes";
import SimilarQuestionLinksPanel from "./SimilarQuestionLinksPanel";
import * as api from "../../../api";

const source = { id: "source", entryKind: "lecture", title: "미분 특강", subject: "수학", question: "", questionImages: [], difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], createdAt: "", updatedAt: "", learningBlocks: [] } as never;
const block = { id: "block", type: "concept", title: "도함수", content: "", unit: "미분", relatedConcepts: ["도함수"] } as never;
const item: QuestionBankItem = { id: "target:1", entryId: "target", entryTitle: "기출", entryKind: "problem_sheet", questionNumber: "1", subject: "수학", questionText: "도함수 문제", source: { type: "unknown" }, classification: { subject: "수학", sourceType: "unknown", unit: "미분", concepts: ["도함수"], answerType: "unknown", isPastExam: false }, questionImages: [], sourcePageImages: [], hasAnswer: false, hasExplanation: false, hasImages: false, isWrong: false, isMastered: false, reviewDue: false, updatedAt: "" };
const secondItem: QuestionBankItem = { ...item, id: "other:2", entryId: "other", entryTitle: "다른 기출", questionNumber: "2" };

describe("SimilarQuestionLinksPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the existing links and offers retry after a save failure", async () => {
    const onChange = vi.fn().mockRejectedValue(new Error("disk"));
    render(<SimilarQuestionLinksPanel sourceEntry={source} block={block} links={[]} items={[item]} onOpen={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "유사 문제 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "연결" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("관련 문제 연결을 저장하지 못했습니다."));
    expect(screen.getByRole("button", { name: "다시 저장" })).toBeInTheDocument();
  });

  it("keeps local candidates when Gemini returns no allowed results", async () => {
    vi.spyOn(api, "rankSimilarQuestionsWithAi").mockResolvedValue({ content: JSON.stringify({ results: [{ candidateId: "outside:1", score: 90 }] }), model: "gemini-3.5-flash", promptVersion: "similar-question-ranking-v1" });
    render(<SimilarQuestionLinksPanel sourceEntry={source} block={block} links={[]} items={[item]} onOpen={vi.fn()} onChange={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole("button", { name: "유사 문제 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "Gemini로 기존 후보 재정렬" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("기존 추천을 유지합니다."));
    expect(screen.getByText("기출 1번")).toBeInTheDocument();
  });

  it("records Gemini provenance only for candidates returned by Gemini", async () => {
    vi.spyOn(api, "rankSimilarQuestionsWithAi").mockResolvedValue({ content: JSON.stringify({ results: [{ candidateId: "target:1", score: 90 }] }), model: "gemini-3.5-flash", promptVersion: "similar-question-ranking-v1" });
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<SimilarQuestionLinksPanel sourceEntry={source} block={block} links={[]} items={[item, secondItem]} onOpen={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "유사 문제 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "Gemini로 기존 후보 재정렬" }));
    await waitFor(() => expect(api.rankSimilarQuestionsWithAi).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole("button", { name: "연결" })[1]);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ source: "local" });
    expect(onChange.mock.calls[0][0][0]).not.toHaveProperty("model");
  });
});
