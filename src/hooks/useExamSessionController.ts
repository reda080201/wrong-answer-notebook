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
}

export function useExamSessionController({
  existingEntries = EMPTY_ENTRIES,
  commitExamSubmission,
}: UseExamSessionControllerOptions) {
  const [session, setSession] = useState<ExamSession | null>(null);
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    generatedEntryKeysRef.current = new Set(
      existingEntries
        .filter((entry) => entry.generatedFromExamSessionId && entry.generatedFromQuestionNumber)
        .map((entry) => `${entry.generatedFromExamSessionId}:${normalizeExamQuestionNumber(entry.generatedFromQuestionNumber)}`),
    );
  }, [existingEntries]);

  const reload = useCallback(async (): Promise<boolean> => {
    if (loadInFlightRef.current) return false;
    loadInFlightRef.current = true;
    const request = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const items = await loadExamSessions();
      if (request !== loadRequestRef.current) return false;
      if (!Array.isArray(items)) throw new Error("모의고사 세션 저장 형식이 올바르지 않습니다. 배열이어야 합니다.");
      const normalized = items;
      savedSessionsRef.current = normalized;
      persistedSessionsRef.current = normalized;
      setSavedSessions(normalized);
      loadedRef.current = true;
      return true;
    } catch (error) {
      if (request !== loadRequestRef.current) return false;
      loadedRef.current = false;
      setLoadError(error instanceof Error && error.message
        ? error.message
        : "시험 기록을 불러오지 못했습니다.");
      return false;
    } finally {
      if (request === loadRequestRef.current) {
        loadInFlightRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  const open = useCallback((entry: WrongAnswerEntry, options: ExamOpenOptions | ExamSession = {}) => {
    const normalizedOptions: ExamOpenOptions = "status" in options
      ? { mode: options.mode ?? "practice", resumable: options }
      : options;
    setStartError(null);
    if (!loadedRef.current) {
      setStartError({ entryId: entry.id, message: loadError ?? "시험 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요." });
      return;
    }
    setActiveGeneratedExam(null);
    if (normalizedOptions.resumable) {
      setSession(normalizedOptions.resumable);
      return;
    }
    const next = createExamSession(entry, new Date(), normalizedOptions);
    if (!next.questions.length) {
      setStartError({ entryId: entry.id, message: "감지된 문항이 없어 모의고사를 시작할 수 없습니다. 문제 번호 형식을 확인해 주세요." });
      return;
    }
    const missingAnswers = next.questions
      .filter((question) => !question.correctAnswer?.trim())
      .map((question) => question.questionNumber);
    if (missingAnswers.length) {
      setStartError({ entryId: entry.id, message: `정답이 연결되지 않은 문항이 있습니다: ${missingAnswers.join(", ")}. 답안지를 연결한 뒤 시작해 주세요.` });
      return;
    }
    setSession(next);
  }, [loadError]);

  const openGenerated = useCallback((exam: GeneratedExam, options: ExamOpenOptions = {}) => {
    if (!loadedRef.current) {
      setStartError({ entryId: exam.id, message: loadError ?? "시험 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요." });
      return;
    }
    if (!exam.questions.length) return;
    const mode = options.mode ?? (exam.preset === "real_exam" ? "real" : "practice");
    const resumable = options.resumable ?? savedSessionsRef.current
      .filter((item) => item.entryId === `generated:${exam.id}` && item.status === "in_progress" && (item.mode ?? "practice") === mode)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    setActiveGeneratedExam(exam);
    setStartError(null);
    if (resumable) {
      setSession(normalizeExamSession(resumable));
      return;
    }
    setSession(createSessionFromGeneratedExam(exam, new Date(), { ...options, mode }));
  }, [loadError]);

  const submit = useCallback(async (current: ExamSession) => {
    if (submissionInFlightRef.current) return;
    if (!loadedRef.current) throw new Error(loadError ?? "시험 기록을 불러오는 중이어서 제출할 수 없습니다.");
    if (current.status === "submitted") return;
    submissionInFlightRef.current = true;
    try {
    const score = scoreExamSession(current);
    const submitted = {
      ...current,
      status: "submitted" as const,
      submittedAt: new Date().toISOString(),
      score,
    };
    const wrongQuestions = submitted.questions.filter((question) => {
      const result = score.questionResults.find((item) => item.questionNumber === question.questionNumber);
      return result?.hasResponse && !result.correct;
    });
    const wrongForms = wrongQuestions.filter((question) => {
      const key = `${submitted.id}:${normalizeExamQuestionNumber(question.questionNumber)}`;
      return !generatedEntryKeysRef.current.has(key);
    }).map((question) => {
      const response = submitted.responses.find((item) => item.questionNumber === question.questionNumber);
      const draft = createEmptyEntryDraft("wrong_answer");
      return normalizeEntryDraftForSave({
        ...draft,
        generatedFromExamSessionId: submitted.id,
        generatedFromQuestionNumber: question.questionNumber,
        subject: submitted.subject,
        title: `${submitted.title} · ${question.questionNumber}번 오답`,
        question: [question.question, ...question.choices].filter(Boolean).join("\n"),
        questionImages: question.questionImages,
        figures: question.figures,
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
    setSession(submitted);
    } finally {
      submissionInFlightRef.current = false;
    }
  }, [commitExamSubmission, loadError]);

  useEffect(() => {
    sessionRef.current = session;
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
    setSession,
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
