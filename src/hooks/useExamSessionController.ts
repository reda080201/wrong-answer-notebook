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
import { normalizeQuestionNumber } from "../utils/questionMeta";

const normalizeExamQuestionNumber = (value: string | number | undefined | null) =>
  normalizeQuestionNumber(value);

const EMPTY_ENTRIES: WrongAnswerEntry[] = [];

interface UseExamSessionControllerOptions {
  chatGptPreferences: ChatGptMcpPreferences;
  existingEntries?: WrongAnswerEntry[];
  addEntry?(data: EntryFormData): Promise<unknown>;
  addEntries?(data: EntryFormData[]): Promise<string[]>;
}

export function useExamSessionController({
  chatGptPreferences,
  existingEntries = EMPTY_ENTRIES,
  addEntry,
  addEntries,
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
  const sessionRef = useRef<ExamSession | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef(createSerialTaskQueue());
  const saveSequenceRef = useRef(0);
  const loadRequestRef = useRef(0);
  const loadedRef = useRef(false);
  const generatedEntryKeysRef = useRef(new Set<string>());

  useEffect(() => {
    generatedEntryKeysRef.current = new Set(
      existingEntries
        .filter((entry) => entry.generatedFromExamSessionId && entry.generatedFromQuestionNumber)
        .map((entry) => `${entry.generatedFromExamSessionId}:${normalizeExamQuestionNumber(entry.generatedFromQuestionNumber)}`),
    );
  }, [existingEntries]);

  const reload = useCallback(async (): Promise<boolean> => {
    const request = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const items = await loadExamSessions();
      if (request !== loadRequestRef.current) return false;
      const normalized = Array.isArray(items) ? items : [];
      savedSessionsRef.current = normalized;
      setSavedSessions(normalized);
      loadedRef.current = true;
      setLoading(false);
      return true;
    } catch (error) {
      if (request !== loadRequestRef.current) return false;
      loadedRef.current = false;
      setLoading(false);
      setLoadError(error instanceof Error && error.message
        ? error.message
        : "시험 기록을 불러오지 못했습니다.");
      return false;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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
    if (!loadedRef.current) {
      if (updateUi) setSaveError(loadError ?? "시험 기록을 불러오는 중이어서 저장할 수 없습니다.");
      return false;
    }
    const sequence = ++saveSequenceRef.current;
    const previousSessions = savedSessionsRef.current;
    const nextSessions = mergeExamSession(savedSessionsRef.current, next);
    savedSessionsRef.current = nextSessions;
    if (updateUi) setSavedSessions(nextSessions);
    setSaving(true);
    const saved = await saveQueueRef.current.enqueue(async () => {
      await saveExamSessions(nextSessions);
      return true;
    }).catch((error) => {
      if (sequence === saveSequenceRef.current) {
        savedSessionsRef.current = previousSessions;
        if (updateUi) setSavedSessions(previousSessions);
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

  const open = useCallback((entry: WrongAnswerEntry, resumable?: ExamSession) => {
    setStartError(null);
    if (!loadedRef.current) {
      setStartError({ entryId: entry.id, message: loadError ?? "시험 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요." });
      return;
    }
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
  }, [loadError]);

  const openGenerated = useCallback((exam: GeneratedExam) => {
    if (!loadedRef.current) {
      setStartError({ entryId: exam.id, message: loadError ?? "시험 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요." });
      return;
    }
    if (!exam.questions.length) return;
    setActiveGeneratedExam(exam);
    setStartError(null);
    setSession(createSessionFromGeneratedExam(exam));
  }, [loadError]);

  const submit = useCallback(async (current: ExamSession) => {
    if (!loadedRef.current) throw new Error(loadError ?? "시험 기록을 불러오는 중이어서 제출할 수 없습니다.");
    if (current.status === "submitted") return;
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
    if (wrongForms.length) {
      if (addEntries) {
        await addEntries(wrongForms);
      } else if (addEntry) {
        for (const form of wrongForms) {
          await addEntry(form);
          if (form.generatedFromExamSessionId && form.generatedFromQuestionNumber) {
            generatedEntryKeysRef.current.add(`${form.generatedFromExamSessionId}:${normalizeExamQuestionNumber(form.generatedFromQuestionNumber)}`);
          }
        }
      } else {
        throw new Error("오답 저장 기능을 사용할 수 없습니다.");
      }
      wrongForms.forEach((form) => {
        if (form.generatedFromExamSessionId && form.generatedFromQuestionNumber) {
          generatedEntryKeysRef.current.add(`${form.generatedFromExamSessionId}:${normalizeExamQuestionNumber(form.generatedFromQuestionNumber)}`);
        }
      });
    }
    if (!(await flush(submitted))) throw new Error("제출 결과를 저장하지 못했습니다.");
    setSession(submitted);
  }, [addEntries, addEntry, flush, loadError]);

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
    flush,
    submit,
  };
}
