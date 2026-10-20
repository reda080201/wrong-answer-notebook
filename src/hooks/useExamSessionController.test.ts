import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamSession, ExamSubmissionTransactionResult, GeneratedExam, WrongAnswerEntry } from "../types";

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
import { updateExamResponse } from "../features/exam/services/examSession";
import { createSessionFromGeneratedExam } from "../features/exam-builder/services/createSessionFromGeneratedExam";
import { entrySolutionQuestions, solutionQuestionKey } from "../features/solutions/solutionModel";
import { normalizeEntry } from "../utils/entry";

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

function successfulCommit(submitted: ExamSession): Promise<ExamSubmissionTransactionResult> {
  return Promise.resolve(transactionResult(submitted));
}

describe("useExamSessionController safety guards", () => {
  it("returns an explicit failure when a generated exam cannot open", async () => {
    let resolveLoad!: (sessions: ExamSession[]) => void;
    loadExamSessions.mockReturnValueOnce(new Promise<ExamSession[]>(resolve => { resolveLoad = resolve; }));
    const { result } = renderHook(() => useExamSessionController({ commitExamSubmission: successfulCommit }));
    const generated = { id: "generated-not-ready", questions: [] } as unknown as GeneratedExam;
    let outcome: unknown;
    act(() => { outcome = result.current.openGenerated(generated); });
    expect(outcome).toMatchObject({ ok: false, code: "sessions_not_loaded" });
    await act(async () => { resolveLoad([]); });
    act(() => { outcome = result.current.openGenerated(generated); });
    expect(outcome).toMatchObject({ ok: false, code: "no_questions" });
    expect(result.current.session).toBeNull();
  });
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

  it("submits the latest answer when submit follows an update in the same event", async () => {
    const commitExamSubmission = vi.fn(successfulCommit);
    const { result } = renderHook(() => useExamSessionController({
      chatGptPreferences: preferences,
      commitExamSubmission,
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.open(entry); });
    const previouslyRenderedSession = result.current.session!;

    let submission!: Promise<void>;
    act(() => {
      result.current.updateSession((current) => updateExamResponse(current, {
        questionNumber: "1",
        response: "②",
        scratchNote: "",
        markedForReview: false,
        updatedAt: "",
      }));
      submission = result.current.submit(previouslyRenderedSession);
    });
    await act(async () => { await submission; });

    expect(commitExamSubmission).toHaveBeenCalledTimes(1);
    expect(commitExamSubmission.mock.calls[0][0].responses).toMatchObject([
      { questionNumber: "1", response: "②" },
    ]);
    expect(result.current.session?.status).toBe("submitted");
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
    act(() => result.current.updateSession((latest) => updateExamResponse(latest, {
      questionNumber: "1",
      response: "①",
      scratchNote: "",
      markedForReview: false,
      updatedAt: "",
    })));
    const input = result.current.session!;

    await act(async () => { await result.current.submit(input); });
    expect(commitExamSubmission).toHaveBeenCalledTimes(1);
    expect(saveExamSessions).not.toHaveBeenCalled();
    expect(result.current.session?.status).toBe("submitted");
    const derivedWrongForm = commitExamSubmission.mock.calls[0][1][0] as Partial<WrongAnswerEntry>;
    expect(derivedWrongForm?.myAnswer).toBe("①");
    expect(derivedWrongForm?.question).toContain("첫 문제");
    expect(derivedWrongForm?.questionContentSegments?.["1"]).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text", text: "첫 문제" }),
    ]));
    const submitted = result.current.session!;

    await act(async () => { await result.current.submit({ ...submitted, status: "in_progress" }); });
    expect(commitExamSubmission).toHaveBeenCalledTimes(2);
    expect(commitExamSubmission.mock.calls[1][1]).toEqual([]);
  });

  it("preserves the original page and solution links on a normal submitted wrong answer", async () => {
    const commitExamSubmission = vi.fn((submitted: ExamSession) => successfulCommit(submitted));
    const { result } = renderHook(() => useExamSessionController({ commitExamSubmission }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const source: WrongAnswerEntry = {
      ...entry,
      question: "3. 본문\n① 하나\n② 둘",
      sourcePageImages: ["page-1.png", "page-2.png"],
      structuredQuestions: [{ questionNumber: "3", questionText: "본문", conditions: [], equations: [], choices: ["① 하나", "② 둘"], figureIds: [], source: { page: 2 }, contentSegments: [{ id: "body", type: "text", text: "본문" }, { id: "formula", type: "equation", latex: "x^2", display: true }] }],
      answerKey: [{ id: "a3", questionNumber: "3", answer: "②", explanation: "해설", intent: "출제 의도", importantPoints: [] }],
      questionSolutionHotspots: [{ id: "dot3", sourcePageImage: "page-2.png", questionKey: '["3",""]', x: 0.1, y: 0.2 }],
    };
    act(() => result.current.open(source));
    act(() => result.current.updateSession(current => updateExamResponse(current, { questionNumber: "3", response: "①", scratchNote: "", markedForReview: false, updatedAt: "" })));
    await act(async () => { await result.current.submit(result.current.session!); });
    const forms = (commitExamSubmission.mock.calls[0] as unknown as [ExamSession, WrongAnswerEntry[]])[1];
    const saved = normalizeEntry({ ...forms[0], id: "wrong3", createdAt: entry.createdAt, updatedAt: entry.updatedAt });
    const [solution] = entrySolutionQuestions(saved);
    expect(saved.sourcePageImages).toEqual(["page-2.png"]);
    expect(solution.number).toBe("3");
    expect(solution.page).toBe(1);
    expect(solution.answer).toMatchObject({ answer: "②", explanation: "해설", intent: "출제 의도" });
    expect(saved.questionSolutionHotspots).toEqual([expect.objectContaining({ questionKey: solution.key, sourcePageImage: "page-2.png" })]);
    expect(saved.structuredQuestions?.[0].contentSegments?.map(segment => segment.id)).toEqual(["body", "formula"]);
    expect(saved.supplementalResources).toEqual(expect.arrayContaining([expect.objectContaining({ sourceEntryId: source.id, questionNumbers: ["3"] })]));
  });

  it("keeps generated exam identity separate from original sheet provenance", async () => {
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
    const snapshot = {
      id: "source-question-1",
      questionNumber: "1",
      question: "원본 1번 문항",
      choices: ["①", "②"],
      correctAnswer: "②",
      questionImages: [],
      figures: [],
    };
    const generatedExam = {
      id: "generated-exam-q1-q1",
      title: "두 문제지 생성 시험",
      subject: "수학",
      timeLimitMinutes: 50,
      questions: [
        { position: 1, snapshot: { ...snapshot, id: "sheet-a-q1" }, source: { sourceEntryId: "sheet-a", sourceEntryTitle: "문제지 A", sourceQuestionNumber: "1" }, locked: true, selectionScore: 1, selectionReasons: [] },
        { position: 2, snapshot: { ...snapshot, id: "sheet-b-q1", question: "문제지 B의 원문 1번", source: { page: 2 }, sourcePageImages: ["sheet-b-page1.png", "sheet-b-page2.png"], questionSolutionHotspots: [{ id: "dot", questionKey: "source-question-1", sourcePageImage: "sheet-b-page2.png", x: 0.2, y: 0.3 }], solutionAnswer: { id: "source-answer", questionNumber: "1", answer: "②", explanation: "B 해설", intent: "B 의도", importantPoints: [] } }, source: { sourceEntryId: "sheet-b", sourceEntryTitle: "문제지 B", sourceQuestionNumber: "1" }, locked: true, selectionScore: 1, selectionReasons: [] },
      ],
    } as unknown as GeneratedExam;
    const convertedSession = createSessionFromGeneratedExam(generatedExam, new Date("2026-01-01T00:00:00.000Z"), { mode: "real" });
    expect(convertedSession.questions.map((question) => question.questionNumber)).toEqual(["1", "2"]);
    expect(convertedSession.questions.map((question) => question.sourceQuestionNumber)).toEqual(["1", "1"]);
    const generatedSession: ExamSession = {
      ...convertedSession,
      id: "generated-session-q1-q1",
      responses: [
        { questionNumber: "1", response: "②", scratchNote: "", markedForReview: false, updatedAt: "" },
        { questionNumber: "2", response: "①", scratchNote: "", markedForReview: false, updatedAt: "" },
      ],
    };
    act(() => result.current.setSession(generatedSession));

    await act(async () => { await result.current.submit(generatedSession); });

    const wrongForms = commitExamSubmission.mock.calls[0][1] as Array<Partial<WrongAnswerEntry>>;
    expect(wrongForms).toHaveLength(1);
    expect(wrongForms[0].generatedFromExamSessionId).toBe("generated-session-q1-q1");
    expect(wrongForms[0].generatedFromQuestionNumber).toBe("2");
    const [solution] = entrySolutionQuestions(wrongForms[0] as WrongAnswerEntry);
    expect(solution.page).toBe(2);
    expect(solution.number).toBe("2");
    expect(solution.answer).toMatchObject({ questionNumber: "2", explanation: "B 해설", intent: "B 의도" });
    expect(wrongForms[0].questionSolutionHotspots).toEqual([expect.objectContaining({ questionKey: solutionQuestionKey({ questionNumber: "2" }), sourcePageImage: "sheet-b-page2.png" })]);
    expect(wrongForms[0].supplementalResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceEntryId: "sheet-b",
        questionNumbers: ["1"],
        generatedFromExamSessionId: "generated-session-q1-q1",
        generatedFromQuestionNumber: "2",
      }),
    ]));

    await act(async () => {
      await result.current.submit({ ...result.current.session!, status: "in_progress" });
    });
    expect(commitExamSubmission).toHaveBeenCalledTimes(2);
    expect(commitExamSubmission.mock.calls[1][1]).toEqual([]);
  });
});
