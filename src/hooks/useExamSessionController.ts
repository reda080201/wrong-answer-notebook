import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadExamSessions,
  saveExamSessions,
  syncMcpBridgeActiveExamContext,
} from "../api";
import type {
  ActiveExamContext,
  ChatGptMcpPreferences,
  EntryFormData,
  ExamSession,
  GeneratedExam,
  WrongAnswerEntry,
} from "../types";
import { createExamSession } from "../features/exam/services/examSession";
import { scoreExamSession } from "../features/exam/services/examScoring";
import {
  EXAM_SESSION_AUTOSAVE_DEBOUNCE_MS,
  mergeExamSession,
} from "../features/exam/storage/examSessionStorage";
import { createSessionFromGeneratedExam } from "../features/exam-builder/services/createSessionFromGeneratedExam";
import { createEmptyEntryDraft, normalizeEntryDraftForSave } from "../features/entries/model/entryDraft";
import { createSerialTaskQueue } from "./useSerialTaskQueue";

interface UseExamSessionControllerOptions {
  chatGptPreferences: ChatGptMcpPreferences;
  addEntry(data: EntryFormData): Promise<unknown>;
}

export function useExamSessionController({
  chatGptPreferences,
  addEntry,
}: UseExamSessionControllerOptions) {
  const [session, setSession] = useState<ExamSession | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startError, setStartError] = useState<{ entryId: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSessions, setSavedSessions] = useState<ExamSession[]>([]);
  const [activeGeneratedExam, setActiveGeneratedExam] = useState<GeneratedExam | null>(null);
  const savedSessionsRef = useRef<ExamSession[]>([]);
  const sessionRef = useRef<ExamSession | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef(createSerialTaskQueue());
  const saveSequenceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadExamSessions().then((items) => {
      if (cancelled) return;
      const normalized = Array.isArray(items) ? items : [];
      savedSessionsRef.current = normalized;
      setSavedSessions(normalized);
    }).catch(() => {
      if (!cancelled) setSavedSessions([]);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session) {
      void syncMcpBridgeActiveExamContext({
        sessionId: null,
        questionId: null,
        questionIndex: null,
        userResponse: "",
        scratchNote: "",
        markedForReview: false,
        submitted: false,
        updatedAt: new Date().toISOString(),
        contextUpdatedAt: new Date().toISOString(),
      });
      return;
    }
    const current = session.questions[session.currentQuestionIndex];
    const response = current
      ? session.responses.find((item) => item.questionNumber === current.questionNumber)
      : undefined;
    const context: ActiveExamContext = {
      sessionId: session.id,
      questionId: current?.id ?? null,
      questionIndex: session.currentQuestionIndex,
      userResponse: response?.response ?? "",
      scratchNote: response?.scratchNote ?? "",
      markedForReview: response?.markedForReview ?? false,
      submitted: session.status === "submitted",
      updatedAt: session.updatedAt,
      shareUserResponse: chatGptPreferences.shareUserResponse,
      shareScratchNote: chatGptPreferences.shareScratchNote,
      shareQuestionImages: chatGptPreferences.shareQuestionImages,
      shareSourcePageImages: chatGptPreferences.shareSourcePageImages,
      contextUpdatedAt: new Date().toISOString(),
    };
    const timer = window.setTimeout(() => { void syncMcpBridgeActiveExamContext(context); }, 350);
    return () => window.clearTimeout(timer);
  }, [chatGptPreferences, session]);

  const flush = useCallback(async (next: ExamSession, updateUi = true): Promise<boolean> => {
    const sequence = ++saveSequenceRef.current;
    const nextSessions = mergeExamSession(savedSessionsRef.current, next);
    savedSessionsRef.current = nextSessions;
    if (updateUi) setSavedSessions(nextSessions);
    setSaving(true);
    const saved = await saveQueueRef.current.enqueue(async () => {
      await saveExamSessions(nextSessions);
      return true;
    }).catch((error) => {
      if (sequence === saveSequenceRef.current) {
        setSaveError(error instanceof Error && error.message
          ? error.message
          : "모의고사 진행 상태를 저장하지 못했습니다.");
      }
      return false;
    });
    if (sequence === saveSequenceRef.current) {
      if (saved) setSaveError(null);
      setSaving(false);
    }
    return saved;
  }, []);

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

  const open = useCallback((entry: WrongAnswerEntry, resumable?: ExamSession) => {
    setStartError(null);
    setActiveGeneratedExam(null);
    if (resumable) {
      setSession(resumable);
      return;
    }
    const next = createExamSession(entry);
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
  }, []);

  const openGenerated = useCallback((exam: GeneratedExam) => {
    if (!exam.questions.length) return;
    setActiveGeneratedExam(exam);
    setStartError(null);
    setSession(createSessionFromGeneratedExam(exam));
  }, []);

  const submit = useCallback(async (current: ExamSession) => {
    const score = scoreExamSession(current);
    const submitted = {
      ...current,
      status: "submitted" as const,
      submittedAt: new Date().toISOString(),
      score,
    };
    setSession(submitted);
    const wrongQuestions = submitted.questions.filter((question) => {
      const result = score.questionResults.find((item) => item.questionNumber === question.questionNumber);
      return result?.hasResponse && !result.correct;
    });
    for (const question of wrongQuestions) {
      const response = submitted.responses.find((item) => item.questionNumber === question.questionNumber);
      const draft = createEmptyEntryDraft("wrong_answer");
      await addEntry(normalizeEntryDraftForSave({
        ...draft,
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
      }));
    }
  }, [addEntry]);

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
    open,
    openGenerated,
    close,
    flush,
    submit,
  };
}
