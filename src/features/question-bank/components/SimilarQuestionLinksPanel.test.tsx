import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    const onChange = vi.fn().mockRejectedValueOnce(new Error("disk")).mockResolvedValue(undefined);
    render(<SimilarQuestionLinksPanel sourceEntry={source} block={block} links={[]} items={[item]} onOpen={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "유사 문제 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "연결" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("관련 문제 연결을 저장하지 못했습니다."));
    expect(screen.getByRole("button", { name: "다시 저장" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 저장" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange.mock.calls[1][0]).toEqual(onChange.mock.calls[0][0]);
  });

  it("discards a failed optimistic link before the next mutation", async () => {
    const onChange = vi.fn().mockRejectedValueOnce(new Error("disk")).mockResolvedValue(undefined);
    render(<SimilarQuestionLinksPanel sourceEntry={source} block={block} links={[]} items={[item, secondItem]} onOpen={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "유사 문제 찾기" }));
    fireEvent.click(screen.getAllByRole("button", { name: "연결" })[0]);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    const secondCandidate = screen.getByText("다른 기출 2번").closest("article");
    expect(secondCandidate).not.toBeNull();
    fireEvent.click(within(secondCandidate!).getByRole("button", { name: "연결" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange.mock.calls[1][0]).toHaveLength(1);
    expect(onChange.mock.calls[1][0][0]).toMatchObject({ targetEntryId: "other" });
  });

  it("keeps local candidates when Gemini returns no allowed results", async () => {
    vi.spyOn(api, "rankSimilarQuestionsWithAi").mockResolvedValue({ content: JSON.stringify({ results: [{ candidateId: "outside:1", score: 90 }] }), model: "gemini-3.5-flash", promptVersion: "similar-question-ranking-v1" });
    render(<SimilarQuestionLinksPanel sourceEntry={source} block={block} links={[]} items={[item]} onOpen={vi.fn()} onChange={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole("button", { name: "유사 문제 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "Gemini로 기존 후보 재정렬" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("기존 추천을 유지합니다."));
    expect(screen.getByText("기출 1번")).toBeInTheDocument();
  });

  it("explains unavailable provider state and opens AI settings", () => {
    const onOpenAiSettings = vi.fn();
    render(<SimilarQuestionLinksPanel
      sourceEntry={source}
      block={block}
      links={[]}
      items={[item]}
      onOpen={vi.fn()}
      onChange={vi.fn().mockResolvedValue(undefined)}
      aiProviderStatus={{ type: "manual", enabled: false, keySource: "env", hasStoredKey: false, hasEnvKey: false, available: false, message: "API 키가 없습니다." }}
      onOpenAiSettings={onOpenAiSettings}
    />);
    fireEvent.click(screen.getByRole("button", { name: "유사 문제 찾기" }));
    expect(screen.getByRole("status")).toHaveTextContent("Gemini 재정렬 준비 필요");
    expect(screen.getByRole("button", { name: "Gemini로 기존 후보 재정렬" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "AI 설정 열기" }));
    expect(onOpenAiSettings).toHaveBeenCalledTimes(1);
  });

  it("retries a failed Gemini ranking only after an explicit click", async () => {
    const ranking = vi.spyOn(api, "rankSimilarQuestionsWithAi")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ content: JSON.stringify({ results: [{ candidateId: "target:1", score: 90 }] }), model: "gemini-3.5-flash", promptVersion: "similar-question-ranking-v1" });
    render(<SimilarQuestionLinksPanel sourceEntry={source} block={block} links={[]} items={[item]} onOpen={vi.fn()} onChange={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole("button", { name: "유사 문제 찾기" }));
    expect(ranking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Gemini로 기존 후보 재정렬" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("network down"));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(ranking).toHaveBeenCalledTimes(2));
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

  it("serializes rapid link saves against the latest optimistic snapshot", async () => {
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    const first = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<void>((resolve) => { resolveSecond = resolve; });
    const onChange = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    render(<SimilarQuestionLinksPanel sourceEntry={source} block={block} links={[]} items={[item, secondItem]} onOpen={vi.fn()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "유사 문제 찾기" }));
    const buttons = screen.getAllByRole("button", { name: "연결" });
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
    resolveFirst?.();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange.mock.calls[1][0]).toHaveLength(2);
    expect(onChange.mock.calls[1][0].map((link: { targetEntryId: string }) => link.targetEntryId).sort()).toEqual(["other", "target"]);
    resolveSecond?.();
  });
});
