import { isAnswerReadyForGrading } from "../utils/studyAssessment";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadExamSessions,
  saveExamSessions,
} from "../api";
import type {
  ChatGptMcpPreferences,
  EntryFormData,
  ExamMode,
  ExamSession,
  ExamSubmissionTransactionResult,
  GeneratedExam,
  WrongAnswerEntry,
} from "../types";
import { createExamSession } from "../features/exam/services/examSession";
import { scoreExamSession } from "../features/exam/services/examScoring";
import {
  EXAM_SESSION_AUTOSAVE_DEBOUNCE_MS,
  mergeExamSession,
  normalizeExamSession,
} from "../features/exam/storage/examSessionStorage";
import { createSessionFromGeneratedExam } from "../features/exam-builder/services/createSessionFromGeneratedExam";
import { createEmptyEntryDraft, normalizeEntryDraftForSave } from "../features/entries/model/entryDraft";
import { createSerialTaskQueue } from "./useSerialTaskQueue";
import { normalizeQuestionNumber } from "../utils/questionMeta";
import { wrongAnswerPresentation } from "../features/exam/services/wrongAnswerPresentation";
import { presentSessionSharedPassages } from "../utils/sharedPassageRecovery";

const normalizeExamQuestionNumber = (value: string | number | undefined | null) =>
  normalizeQuestionNumber(value);

const EMPTY_ENTRIES: WrongAnswerEntry[] = [];

interface UseExamSessionControllerOptions {
  /** Retained for call-site compatibility; MCP sync is now user initiated. */
  chatGptPreferences?: ChatGptMcpPreferences;
  existingEntries?: WrongAnswerEntry[];
  commitExamSubmission: (
    submittedSession: ExamSession,
    data: EntryFormData[],
  ) => Promise<ExamSubmissionTransactionResult>;
}

export interface ExamOpenOptions {
  mode?: ExamMode;
  resumable?: ExamSession;
  timeLimitMinutes?: number;
  showTimer?: boolean;
  answerSheetOpen?: boolean;
  answerSheetLayout?: "auto" | "vertical" | "horizontal";
}

export type ExamOpenResult =
  | { ok: true; session: ExamSession }
  | { ok: false; code: "sessions_not_loaded" | "no_questions" | "missing_answers"; message: string };

export type ExamSessionRecipe = (current: ExamSession) => ExamSession;

export function useExamSessionController({
  existingEntries = EMPTY_ENTRIES,
  commitExamSubmission,
}: UseExamSessionControllerOptions) {
  const [session, setSession] = useState<ExamSession | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const startErrorSourceRef = useRef<WrongAnswerEntry | null>(null);
  const [startError, setStartError] = useState<{ entryId: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSessions, setSavedSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeGeneratedExam, setActiveGeneratedExam] = useState<GeneratedExam | null>(null);
  const savedSessionsRef = useRef<ExamSession[]>([]);
  const persistedSessionsRef = useRef<ExamSession[]>([]);
  const sessionRef = useRef<ExamSession | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef(createSerialTaskQueue());
  const saveSequenceRef = useRef(0);
  const loadRequestRef = useRef(0);
  const loadInFlightRef = useRef(false);
  const loadedRef = useRef(false);
  const generatedEntryKeysRef = useRef(new Set<string>());
  const submissionInFlightRef = useRef(false);

  const replaceSession = useCallback<typeof setSession>(value => {
    const next = typeof value === "function" ? value(sessionRef.current) : value;
    sessionRef.current = next;
    setSession(next);
  }, []);

  const updateSession = useCallback((recipe: ExamSessionRecipe) => {
    const current = sessionRef.current;
    if (!current) return;
    const next = recipe(current);
    // Keep imperative reads (especially submit) in step with updates that React
    // has queued but has not committed yet.
    sessionRef.current = next;
    setSession(next);
  }, []);

  useEffect(() => {
    generatedEntryKeysRef.current = new Set(
      existingEntries
        .filter((entry) => entry.generatedFromExamSessionId && entry.generatedFromQuestionNumber)
        .map((entry) => `${entry.generatedFromExamSessionId}:${normalizeExamQuestionNumber(entry.generatedFromQuestionNumber)}`),
    );
  }, [existingEntries]);

  useEffect(() => {
    const previous = startErrorSourceRef.current;
    if (!previous) return;
    const current = existingEntries.find(entry => entry.id === previous.id);
    if (current === previous) return;
    startErrorSourceRef.current = current ?? null;
    setStartError(error => {
      if (!error || error.entryId !== previous.id) return error;
      if (!current || !error.message.startsWith("정답이 연결되지 않은 문항")) return null;
      const missing = createExamSession(current).questions.filter(question => !question.correctAnswer?.trim()).map(question => question.questionNumber);
      return missing.length ? { entryId: current.id, message: `정답이 연결되지 않은 문항이 있습니다: ${missing.join(", ")}. 답안지를 연결하거나 AI 예상 답을 확인한 뒤 시작해 주세요.` } : null;
    });
  }, [existingEntries]);

  const hydrateSessions = useCallback(async () => {
    if (loadInFlightRef.current) return null;
    loadInFlightRef.current = true;
    const request = ++loadRequestRef.current;
    try {
      const items = await loadExamSessions();
      if (!Array.isArray(items)) throw new Error("모의고사 세션 저장 형식이 올바르지 않습니다. 배열이어야 합니다.");
      return { request, ok: true as const, sessions: items };
    } catch (error) {
      return { request, ok: false as const, error };
    } finally {
      if (request === loadRequestRef.current) loadInFlightRef.current = false;
    }
  }, []);

  const applyHydratedSessions = useCallback((result: Awaited<ReturnType<typeof hydrateSessions>>) => {
    if (!result || result.request !== loadRequestRef.current) return false;
    if (!result.ok) {
      loadedRef.current = false;
      setLoadError(result.error instanceof Error && result.error.message ? result.error.message : "시험 기록을 불러오지 못했습니다.");
      setLoading(false);
      return false;
    }
    const normalized = result.sessions;
    savedSessionsRef.current = normalized;
    persistedSessionsRef.current = normalized;
    setSavedSessions(normalized);
    setLoadError(null);
    loadedRef.current = true;
    setLoading(false);
    return true;
  }, []);

  const reload = useCallback(async (): Promise<boolean> => {
    if (loadInFlightRef.current) return false;
    setLoading(true);
    setLoadError(null);
    return hydrateSessions().then(applyHydratedSessions);
  }, [applyHydratedSessions, hydrateSessions]);

  useEffect(() => {
    void hydrateSessions().then(applyHydratedSessions);
  }, [applyHydratedSessions, hydrateSessions]);

  const flush = useCallback(async (next: ExamSession, updateUi = true): Promise<boolean> => {
    if (!loadedRef.current) {
      if (updateUi) setSaveError(loadError ?? "시험 기록을 불러오는 중이어서 저장할 수 없습니다.");
      return false;
    }
    const sequence = ++saveSequenceRef.current;
    const optimisticSessions = mergeExamSession(savedSessionsRef.current, next);
    savedSessionsRef.current = optimisticSessions;
    if (updateUi) setSavedSessions(optimisticSessions);
    if (updateUi) setSaving(true);
    const saved = await saveQueueRef.current.enqueue(async () => {
      const nextSessions = mergeExamSession(persistedSessionsRef.current, next);
      await saveExamSessions(nextSessions);
      persistedSessionsRef.current = nextSessions;
      savedSessionsRef.current = nextSessions;
      return true;
    }).catch((error) => {
      if (sequence === saveSequenceRef.current) {
        savedSessionsRef.current = persistedSessionsRef.current;
        if (updateUi) setSavedSessions(persistedSessionsRef.current);
        if (updateUi) {
          setSaveError(error instanceof Error && error.message
            ? error.message
            : "모의고사 진행 상태를 저장하지 못했습니다.");
        }
      }
      return false;
    });
    if (updateUi && sequence === saveSequenceRef.current) {
      if (saved) setSaveError(null);
      setSaving(false);
    }
    return saved;
  }, [loadError]);

  const close = useCallback(async (): Promise<boolean> => {
    if (submitting) {
      setSaveError("시험 제출 중에는 이동하거나 닫을 수 없습니다.");
      return false;
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const current = sessionRef.current;
    if (current && !(await flush(current))) return false;
    // Closing persisted this exact revision. A later open, answer, or restore
    // owns the current screen and must survive the earlier save completion.
    if (sessionRef.current !== current) return false;
    sessionRef.current = null;
    setSession(null);
    setActiveGeneratedExam(null);
    return true;
  }, [flush, submitting]);

  const discardActiveSessionAfterRestore = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    sessionRef.current = null;
    setSession(null);
    setActiveGeneratedExam(null);
    setSubmitting(false);
    setSaveError(null);
  }, []);

  const open = useCallback((entry: WrongAnswerEntry, options: ExamOpenOptions | ExamSession = {}): ExamOpenResult => {
    const normalizedOptions: ExamOpenOptions = "status" in options
      ? { mode: options.mode ?? "practice", resumable: options }
      : options;
    startErrorSourceRef.current = entry;
    setStartError(null);
    if (!loadedRef.current) {
      const message = loadError ?? "시험 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.";
      setStartError({ entryId: entry.id, message });
      return { ok: false, code: "sessions_not_loaded", message };
    }
    setActiveGeneratedExam(null);
    if (normalizedOptions.resumable) {
      const resumed = normalizeExamSession(normalizedOptions.resumable);
      sessionRef.current = resumed;
      setSession(resumed);
      return { ok: true, session: resumed };
    }
    const next = createExamSession(entry, new Date(), normalizedOptions);
    if (!next.questions.length) {
      const message = "감지된 문항이 없어 모의고사를 시작할 수 없습니다. 문제 번호 형식을 확인해 주세요.";
      setStartError({ entryId: entry.id, message });
      return { ok: false, code: "no_questions", message };
    }
    const missingAnswers = next.questions
      .filter((question) => !question.correctAnswer?.trim())
      .map((question) => question.questionNumber);
    if (missingAnswers.length) {
      const message = `정답이 연결되지 않은 문항이 있습니다: ${missingAnswers.join(", ")}. 답안지를 연결하거나 AI 예상 답을 확인한 뒤 시작해 주세요.`;
      setStartError({ entryId: entry.id, message });
      return { ok: false, code: "missing_answers", message };
    }
    sessionRef.current = next;
    setSession(next);
    return { ok: true, session: next };
  }, [loadError]);

  const openGenerated = useCallback((exam: GeneratedExam, options: ExamOpenOptions = {}): ExamOpenResult => {
    if (!loadedRef.current) {
      const message = loadError ?? "시험 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.";
      setStartError({ entryId: exam.id, message });
      return { ok: false, code: "sessions_not_loaded", message };
    }
    if (!exam.questions.length) {
      const message = "문항이 없는 모의고사는 시작할 수 없습니다.";
      setStartError({ entryId: exam.id, message });
      return { ok: false, code: "no_questions", message };
    }
    const unconfirmed = exam.questions.filter(question => question.snapshot.solutionAnswer?.answerProvenance && !isAnswerReadyForGrading(question.snapshot.solutionAnswer));
    if (unconfirmed.length) {
      const message = `정답 확인이 필요한 문항: ${unconfirmed.map(question => question.position).join(", ")}. 정답을 확인하거나 해당 문항을 제외한 뒤 시작하세요.`;
      setStartError({ entryId: exam.id, message });
      return { ok: false, code: "missing_answers", message };
    }
    const mode = options.mode ?? (exam.preset === "real_exam" ? "real" : "practice");
    const resumable = options.resumable ?? savedSessionsRef.current
      .filter((item) => item.entryId === `generated:${exam.id}` && item.status === "in_progress" && (item.mode ?? "practice") === mode)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    setActiveGeneratedExam(exam);
    setStartError(null);
    if (resumable) {
      const resumed = normalizeExamSession(resumable);
      sessionRef.current = resumed;
      setSession(resumed);
      return { ok: true, session: resumed };
    }
    const next = createSessionFromGeneratedExam(exam, new Date(), { ...options, mode });
    sessionRef.current = next;
    setSession(next);
    return { ok: true, session: next };
  }, [loadError]);

  const submit = useCallback(async (current: ExamSession) => {
    if (submissionInFlightRef.current) return;
    if (!loadedRef.current) throw new Error(loadError ?? "시험 기록을 불러오는 중이어서 제출할 수 없습니다.");
    const latest = sessionRef.current;
    const sessionToSubmit = current.status === "in_progress" && latest?.id === current.id && latest.status === "in_progress"
      ? latest
      : current;
    if (sessionToSubmit.status === "submitted") return;
    if (sessionToSubmit.questions.some(question => question.solutionAnswer?.answerProvenance && !isAnswerReadyForGrading(question.solutionAnswer))) throw new Error("확인하지 않은 AI 예상 답이 있어 채점할 수 없습니다. 정답을 확인한 뒤 다시 시도하세요.");
    submissionInFlightRef.current = true;
    try {
    const score = scoreExamSession(sessionToSubmit);
    const submitted = {
      ...sessionToSubmit,
      status: "submitted" as const,
      submittedAt: new Date().toISOString(),
      score,
    };
    const presentationSession = presentSessionSharedPassages(submitted, existingEntries);
    const wrongQuestions = presentationSession.questions.filter((question) => {
      const result = score.questionResults.find((item) => item.questionNumber === question.questionNumber);
      return result?.hasResponse && !result.correct;
    });
    const wrongForms = wrongQuestions.filter((question) => {
      const key = `${submitted.id}:${normalizeExamQuestionNumber(question.questionNumber)}`;
      return !generatedEntryKeysRef.current.has(key);
    }).map((question) => {
      const response = submitted.responses.find((item) => item.questionNumber === question.questionNumber);
      const draft = createEmptyEntryDraft("wrong_answer");
      const presentation = wrongAnswerPresentation(presentationSession, question);
      const sourceEntryId = question.sourceEntryId ?? (!submitted.entryId.startsWith("generated:") ? submitted.entryId : undefined);
      const sourceQuestionNumber = question.sourceQuestionNumber ?? (!submitted.entryId.startsWith("generated:") ? question.questionNumber : undefined);
      const sourceProvenance = sourceEntryId && sourceQuestionNumber
        ? [{
            id: `exam-source-${submitted.id}-${question.questionNumber}`,
            kind: "other" as const,
            title: `원본 문제지 ${sourceEntryId} · 원문 ${sourceQuestionNumber}번`,
            createdAt: submitted.updatedAt,
            updatedAt: submitted.updatedAt,
            sourceEntryId,
            questionNumbers: [sourceQuestionNumber],
            generatedFromExamSessionId: submitted.id,
            generatedFromQuestionNumber: question.questionNumber,
          }]
        : [];
      return normalizeEntryDraftForSave({
        ...draft,
        generatedFromExamSessionId: submitted.id,
        generatedFromQuestionNumber: question.questionNumber,
        subject: submitted.subject,
        title: `${submitted.title} · ${question.questionNumber}번 오답`,
        question: [
          question.passage,
          ...(question.conditions ?? []),
          ...(question.equations ?? []),
          question.question,
          ...question.choices,
        ].filter(Boolean).join("\n"),
        questionImages: question.questionImages,
        ...presentation,
        supplementalResources: [...(presentation.supplementalResources ?? []), ...sourceProvenance],
        myAnswer: response?.response ?? "",
        correctAnswer: question.correctAnswer ?? "",
        memo: [`모의고사: ${submitted.title}`, response?.scratchNote?.trim()].filter(Boolean).join("\n"),
        explanationParts: question.explanation
          ? [{ id: crypto.randomUUID(), text: question.explanation, images: [] }]
          : draft.explanationParts,
        tags: [submitted.subject, "모의고사", "채점 오답"],
      });
    });
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await saveQueueRef.current.drain();
    const result = await saveQueueRef.current.enqueue(() => commitExamSubmission(submitted, wrongForms));
    persistedSessionsRef.current = result.sessions;
    savedSessionsRef.current = result.sessions;
    setSavedSessions(result.sessions);
    generatedEntryKeysRef.current = new Set(
      result.entries
        .filter((entry) => entry.generatedFromExamSessionId && entry.generatedFromQuestionNumber)
        .map((entry) => `${entry.generatedFromExamSessionId}:${normalizeExamQuestionNumber(entry.generatedFromQuestionNumber)}`),
    );
    sessionRef.current = submitted;
    setSession(submitted);
    } finally {
      submissionInFlightRef.current = false;
    }
  }, [commitExamSubmission, loadError, existingEntries]);

  useEffect(() => {
    if (!session) {
      sessionRef.current = null;
    } else if (sessionRef.current?.id !== session.id || (session.status === "submitted" && sessionRef.current.status !== "submitted")) {
      // A render scheduled by an earlier answer can commit after another quick
      // answer has already advanced the imperative session reference. Only
      // replace that reference when the session identity or terminal state
      // changes; updates in the active session go through updateSession().
      sessionRef.current = session;
    }
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    if (session) {
      saveTimerRef.current = window.setTimeout(() => {
        const latest = sessionRef.current;
        if (latest) void flush(latest);
        saveTimerRef.current = null;
      }, EXAM_SESSION_AUTOSAVE_DEBOUNCE_MS);
    }
  }, [flush, session]);

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    const latest = sessionRef.current;
    if (latest) void flush(latest, false);
  }, [flush]);

  return {
    session,
    setSession: replaceSession,
    updateSession,
    sessionRef,
    saveTimerRef,
    submitting,
    setSubmitting,
    saving,
    saveError,
    setSaveError,
    startError,
    setStartError,
    savedSessions,
    activeGeneratedExam,
    loading,
    loadError,
    reload,
    open,
    openGenerated,
    close,
    discardActiveSessionAfterRestore,
    flush,
    submit,
  };
}
