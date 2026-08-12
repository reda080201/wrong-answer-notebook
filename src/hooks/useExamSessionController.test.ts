import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamSession, ExamSubmissionTransactionResult, WrongAnswerEntry } from "../types";

const { loadExamSessions, saveExamSessions, syncMcpBridgeActiveExamContext } = vi.hoisted(() => ({
  loadExamSessions: vi.fn(),
  saveExamSessions: vi.fn(),
  syncMcpBridgeActiveExamContext: vi.fn(),
}));

vi.mock("../api", () => ({
  loadExamSessions,
  saveExamSessions,
  syncMcpBridgeActiveExamContext,
}));

import { useExamSessionController } from "./useExamSessionController";

const preferences = {
  shareUserResponse: false,
  shareScratchNote: false,
  shareQuestionImages: false,
  shareSourcePageImages: false,
} as never;

const entry = {
  id: "sheet-1",
  subject: "수학",
  title: "시험지",
  question: "1. 첫 문제\n① 1\n② 2",
  questionImages: [],
  entryKind: "problem_sheet",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  answerKey: [{ id: "answer-1", questionNumber: "1", answer: "②", explanation: "해설", importantPoints: [] }],
  figures: [],
  mastered: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as WrongAnswerEntry;

function transactionResult(submitted: ExamSession, entries: WrongAnswerEntry[] = []): ExamSubmissionTransactionResult {
  return { entries, sessions: [submitted], addedEntryIds: [] };
}

function successfulCommit(submitted: ExamSession, _forms: unknown[]): Promise<ExamSubmissionTransactionResult> {
  return Promise.resolve(transactionResult(submitted));
}

describe("useExamSessionController safety guards", () => {
  beforeEach(() => {
    loadExamSessions.mockReset();
    saveExamSessions.mockReset();
    syncMcpBridgeActiveExamContext.mockReset().mockResolvedValue(undefined);
    loadExamSessions.mockResolvedValue([]);
    saveExamSessions.mockResolvedValue(undefined);
  });

  it("blocks opening an exam until session loading succeeds", async () => {
    let resolveLoad!: (sessions: ExamSession[]) => void;
    loadExamSessions.mockReturnValueOnce(new Promise<ExamSession[]>((resolve) => { resolveLoad = resolve; }));
    const { result } = renderHook(() => useExamSessionController({ chatGptPreferences: preferences, commitExamSubmission: successfulCommit }));

    act(() => result.current.open(entry));
    expect(result.current.session).toBeNull();
    expect(result.current.startError?.message).toContain("불러오는 중");
    expect(saveExamSessions).not.toHaveBeenCalled();

    resolveLoad([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.open(entry));
    expect(result.current.session?.entryId).toBe(entry.id);
  });

  it("does not share an exam context merely by opening or moving through questions", async () => {
    const { result } = renderHook(() => useExamSessionController({
      chatGptPreferences: preferences,
      commitExamSubmission: successfulCommit,
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.open(entry));
    act(() => result.current.setSession({
      ...result.current.session!,
      currentQuestionIndex: 0,
      updatedAt: "2026-01-02T00:00:00.000Z",
    }));

    expect(syncMcpBridgeActiveExamContext).not.toHaveBeenCalled();
  });

  it("keeps exam persistence blocked after load failure and recovers with one retry", async () => {
    loadExamSessions.mockRejectedValueOnce(new Error("permission denied")).mockResolvedValueOnce([]);
    const commitExamSubmission = vi.fn(successfulCommit);
    const { result } = renderHook(() => useExamSessionController({ chatGptPreferences: preferences, commitExamSubmission }));

    await waitFor(() => expect(result.current.loadError).toContain("permission denied"));
    act(() => result.current.open(entry));
    expect(result.current.session).toBeNull();
    expect(saveExamSessions).not.toHaveBeenCalled();
    expect(commitExamSubmission).not.toHaveBeenCalled();

    await act(async () => {
      const first = result.current.reload();
      const duplicate = result.current.reload();
      await expect(duplicate).resolves.toBe(false);
      await expect(first).resolves.toBe(true);
    });
    expect(loadExamSessions).toHaveBeenCalledTimes(2);
    expect(result.current.loadError).toBeNull();
  });

  it("treats a valid JSON object payload as a load failure", async () => {
    loadExamSessions.mockResolvedValueOnce({} as never);
    const { result } = renderHook(() => useExamSessionController({ chatGptPreferences: preferences, commitExamSubmission: successfulCommit }));

    await waitFor(() => expect(result.current.loadError).toContain("배열이어야 합니다"));
    expect(result.current.loading).toBe(false);
    expect(saveExamSessions).not.toHaveBeenCalled();
  });

  it("discards an active session after restore without merging it back into saved sessions", async () => {
    const { result } = renderHook(() => useExamSessionController({ chatGptPreferences: preferences, commitExamSubmission: successfulCommit }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.useFakeTimers();
    try {
      act(() => result.current.open(entry));
      expect(result.current.session).not.toBeNull();

      act(() => result.current.discardActiveSessionAfterRestore());
      expect(result.current.session).toBeNull();
      expect(result.current.sessionRef.current).toBeNull();
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(saveExamSessions).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mark a session submitted when the transaction fails", async () => {
    const commitExamSubmission = vi.fn().mockRejectedValue(new Error("transaction failed"));
    const { result } = renderHook(() => useExamSessionController({
      chatGptPreferences: preferences,
      commitExamSubmission,
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.open(entry));
    const current = result.current.session!;
    const submittedInput: ExamSession = {
      ...current,
      responses: [{ questionNumber: "1", response: "①", scratchNote: "", markedForReview: false, updatedAt: "" }],
    };
    act(() => result.current.setSession(submittedInput));

    await act(async () => {
      await expect(result.current.submit(submittedInput)).rejects.toThrow("transaction failed");
    });
    expect(commitExamSubmission).toHaveBeenCalledTimes(1);
    expect(saveExamSessions).not.toHaveBeenCalled();
    expect(result.current.session?.status).toBe("in_progress");
  });

  it("commits submitted sessions and derived entries through one transaction", async () => {
    const commitExamSubmission = vi.fn((submitted: ExamSession, forms: unknown[]) =>
      Promise.resolve(transactionResult(submitted, forms.map((form, index) => ({
        id: `wrong-${index}`,
        ...(form as object),
        createdAt: "a",
        updatedAt: "a",
      } as WrongAnswerEntry)))),
    );
    const { result } = renderHook(() => useExamSessionController({
      chatGptPreferences: preferences,
      commitExamSubmission,
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.open(entry));
    const current = result.current.session!;
    const input: ExamSession = {
      ...current,
      responses: [{ questionNumber: "1", response: "①", scratchNote: "", markedForReview: false, updatedAt: "" }],
    };

    await act(async () => { await result.current.submit(input); });
    expect(commitExamSubmission).toHaveBeenCalledTimes(1);
    expect(saveExamSessions).not.toHaveBeenCalled();
    expect(result.current.session?.status).toBe("submitted");
    const submitted = result.current.session!;

    await act(async () => { await result.current.submit({ ...submitted, status: "in_progress" }); });
    expect(commitExamSubmission).toHaveBeenCalledTimes(2);
    expect(commitExamSubmission.mock.calls[1][1]).toEqual([]);
  });
});
