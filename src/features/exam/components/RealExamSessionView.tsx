import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExamPreferences, ExamSession } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";
import { IconButton } from "../../../shared/ui";
import { PanelRightOpen, X } from "lucide-react";
import QuestionContentView from "../../../components/QuestionContentView";
import { isMultipleChoiceQuestion } from "../../../utils/structuredQuestionType";
import { scoreExamSession } from "../services/examScoring";
import { updateExamResponse } from "../services/examSession";
import { getRemainingExamSeconds, isExamExpired } from "../services/realExam";
import { sanitizeExamQuestionDomId } from "../services/examDom";
import ExamResponseEditor from "./ExamResponseEditor";
import "./RealExamSessionView.css";

interface RealExamSessionViewProps {
  session: ExamSession;
  onChange(session: ExamSession): void;
  onSubmit(session: ExamSession): void | Promise<void>;
  onSubmittingChange?(value: boolean): void;
  examPreferences?: ExamPreferences;
  onClose(): void;
  closeDisabled?: boolean;
  saveError?: string | null;
  saving?: boolean;
  onRetrySave?(): void;
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function resolveAnswerSheetLayout(session: ExamSession): "vertical" | "horizontal" {
  if (session.answerSheetLayout === "vertical" || session.answerSheetLayout === "horizontal") return session.answerSheetLayout;
  const mathOrMixed = /수학|math/i.test(session.subject)
    || !session.questions.every((question) => isMultipleChoiceQuestion(question.questionType, question.choices));
  return mathOrMixed ? "vertical" : "horizontal";
}

function shouldIgnoreExamArrowNavigation(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='dialog']"));
}

export default function RealExamSessionView({ session, onChange, onSubmit, onSubmittingChange, examPreferences, onClose, closeDisabled = false, saveError = null, saving = false, onRetrySave }: RealExamSessionViewProps) {
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [answerSheetOpen, setAnswerSheetOpen] = useState(session.answerSheetOpen ?? examPreferences?.realExamAnswerSheetOpen ?? true);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<"all" | "wrong" | "unanswered" | "marked">("all");
  const [selectedResultNumber, setSelectedResultNumber] = useState<string | null>(null);
  const [deadlineWarning, setDeadlineWarning] = useState(false);
  const deadlineWarnedRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const pendingScrollQuestionRef = useRef<string | null>(null);
  const expired = isExamExpired(session, new Date(now));
  const remaining = session.deadlineAt ? getRemainingExamSeconds(session.deadlineAt, new Date(now)) : 0;
  const score = session.status === "submitted" ? scoreExamSession(session) : null;
  const responses = useMemo(() => new Map(session.responses.map((item) => [item.questionNumber, item])), [session.responses]);
  const unanswered = session.questions.filter((question) => !responses.get(question.questionNumber)?.response.trim()).map((question) => question.questionNumber);
  const marked = session.questions.filter((question) => responses.get(question.questionNumber)?.markedForReview).map((question) => question.questionNumber);
  const currentQuestionIndex = session.currentQuestionIndex ?? 0;
  const safeCurrentQuestionIndex = Math.max(0, Math.min(currentQuestionIndex, session.questions.length - 1));
  const currentQuestion = session.questions[safeCurrentQuestionIndex];
  const activeQuestions = useMemo(() => currentQuestion?.stimulusGroupId
    ? session.questions.filter((question) => question.stimulusGroupId === currentQuestion.stimulusGroupId)
    : currentQuestion ? [currentQuestion] : [], [currentQuestion, session.questions]);
  const answerSheetLayout = resolveAnswerSheetLayout(session);

  useEffect(() => {
    if (session.status !== "in_progress" || !session.deadlineAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session.deadlineAt, session.status]);

  const updateSession = useCallback((recipe: (current: ExamSession) => ExamSession) => {
    const next = recipe(sessionRef.current);
    sessionRef.current = next;
    onChange(next);
  }, [onChange]);

  const changeResponse = useCallback((questionNumber: string, patch: { response?: string; markedForReview?: boolean }) => {
    const currentSession = sessionRef.current;
    const current = currentSession.responses.find((item) => item.questionNumber === questionNumber);
    updateSession((latest) => updateExamResponse(latest, {
      questionNumber,
      response: patch.response ?? current?.response ?? "",
      scratchNote: current?.scratchNote ?? "",
      markedForReview: patch.markedForReview ?? current?.markedForReview ?? false,
      updatedAt: new Date().toISOString(),
    }));
  }, [updateSession]);

  const submit = useCallback(async () => {
    if (submittingRef.current || sessionRef.current.status === "submitted") return;
    submittingRef.current = true;
    setSubmitting(true);
    onSubmittingChange?.(true);
    try {
      await onSubmit(sessionRef.current);
      setSubmitOpen(false);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
  }, [onSubmit, onSubmittingChange]);

  useEffect(() => {
    if (sessionRef.current.status !== "in_progress" || !sessionRef.current.deadlineAt) return;
    if (examPreferences?.warnBeforeEnd !== false && remaining > 0 && remaining <= 300 && !deadlineWarnedRef.current) {
      deadlineWarnedRef.current = true;
      setDeadlineWarning(true);
    }
    if (expired && examPreferences?.autoSubmitOnTimeExpired && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      void submit();
    }
    if (!expired) autoSubmittedRef.current = false;
  }, [examPreferences?.autoSubmitOnTimeExpired, examPreferences?.warnBeforeEnd, expired, remaining, session.deadlineAt, submit]);

  const visibleQuestions = score && filter !== "all"
    ? session.questions.filter((question) => {
      const result = score.questionResults.find((item) => item.questionNumber === question.questionNumber);
      return filter === "wrong" ? result?.hasResponse && !result.correct : filter === "unanswered" ? !result?.hasResponse : Boolean(result?.markedForReview);
    })
    : session.questions;

  const navigateToQuestion = useCallback((index: number) => {
    const currentSession = sessionRef.current;
    if (index < 0 || index >= currentSession.questions.length) return;
    const questionNumber = currentSession.questions[index]?.questionNumber;
    if (!questionNumber) return;
    pendingScrollQuestionRef.current = sanitizeExamQuestionDomId(questionNumber);
    updateSession((latest) => ({ ...latest, currentQuestionIndex: index }));
  }, [updateSession]);

  useEffect(() => {
    const targetId = pendingScrollQuestionRef.current;
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    pendingScrollQuestionRef.current = null;
  }, [safeCurrentQuestionIndex, activeQuestions]);

  useEffect(() => {
    if (sessionRef.current.status !== "in_progress") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || shouldIgnoreExamArrowNavigation(event.target)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigateToQuestion(safeCurrentQuestionIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        navigateToQuestion(safeCurrentQuestionIndex + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateToQuestion, safeCurrentQuestionIndex]);

  const toggleAnswerSheet = () => {
    const next = !answerSheetOpen;
    setAnswerSheetOpen(next);
    updateSession((latest) => ({ ...latest, answerSheetOpen: next }));
  };

  return (
    <section className="real-exam-session" aria-label="실전 모의고사">
      <header className="real-exam-header">
        <div><span>실전 모드</span><h2>{session.title}</h2></div>
        <div className="real-exam-header-status">
          <strong aria-label="남은 시간">{session.deadlineAt ? (session.showTimer === false ? "타이머 숨김" : formatTime(remaining)) : "시간 제한 없음"}</strong>
          <span>응답 {session.responses.filter((item) => item.response.trim()).length}/{session.questions.length}</span>
          <button type="button" onClick={() => setSubmitOpen(true)} disabled={session.status === "submitted" || submitting}>{submitting ? "제출 중..." : "시험 제출"}</button>
          <IconButton className="real-exam-close" label="시험 닫기" onClick={onClose} disabled={closeDisabled || submitting}><X size={20} /></IconButton>
        </div>
      </header>
      {saveError && <div className="exam-session-save-error" role="alert"><span>진행 상태 저장 실패: {saveError}</span><button type="button" disabled={saving} onClick={onRetrySave}>다시 저장</button></div>}
      {expired && session.status === "in_progress" && <div className="real-exam-expired" role="alert">시간이 종료되었습니다. 답안 입력을 잠그고 제출할 수 있습니다.</div>}
      {deadlineWarning && !expired && <div className="real-exam-warning" role="status">시험 종료까지 5분 이내입니다.</div>}
      <div className={`real-exam-layout${answerSheetOpen ? "" : " real-exam-layout--sheet-collapsed"}`}>
        <main className="real-exam-paper" aria-label="실전 시험지">
          {activeQuestions.map((question) => {
            const index = session.questions.indexOf(question);
            const response = responses.get(question.questionNumber);
            return (
              <article key={question.id} id={sanitizeExamQuestionDomId(question.questionNumber)} className="real-exam-question">
                <header><h3>문제 {question.questionNumber}</h3><span>{index + 1} / {session.questions.length}</span></header>
                {question.warning && <p className="real-exam-warning">{question.warning}</p>}
                {question.passage && (!question.stimulusGroupId || session.questions.findIndex((item) => item.stimulusGroupId === question.stimulusGroupId) === index) && (
                  <section className="real-exam-passage" aria-label={`${question.questionNumber}번 제시문`}>
                    <QuestionContentView text={question.passage} />
                  </section>
                )}
                <QuestionContentView text={question.question} segments={question.contentSegments} figures={question.figures} />
                <ExamResponseEditor question={question} response={response} disabled={session.status === "submitted" || expired} onChange={(value) => changeResponse(question.questionNumber, { response: value })} />
                <label className="real-exam-review"><input type="checkbox" checked={response?.markedForReview ?? false} disabled={session.status === "submitted" || expired} onChange={(event) => changeResponse(question.questionNumber, { markedForReview: event.target.checked })} /> 검토 표시</label>
              </article>
            );
          })}
        </main>
        <aside className="real-exam-answer-sheet" aria-label="답안지">
          {answerSheetOpen ? <header><h3>답안지</h3><button type="button" onClick={toggleAnswerSheet} aria-label="답안지 접기">접기</button></header> : <div className="real-exam-answer-sheet-rail"><IconButton label="답안지 펼치기" onClick={toggleAnswerSheet}><PanelRightOpen size={20} /></IconButton></div>}
          {answerSheetOpen && <div className={`real-exam-answer-grid real-exam-answer-grid--${answerSheetLayout}`}>{session.questions.map((question, index) => { const response = responses.get(question.questionNumber); const answered = Boolean(response?.response.trim()); const current = index === safeCurrentQuestionIndex; return <div key={question.id} className={`real-exam-answer-item ${answered ? "is-answered" : "is-unanswered"}${current ? " is-current" : ""}${response?.markedForReview ? " is-marked" : ""}`}><button type="button" className="real-exam-answer-jump" aria-current={current ? "step" : undefined} aria-label={`${question.questionNumber}번 ${answered ? "응답" : "미응답"}${response?.markedForReview ? ", 검토 표시" : ""}${current ? ", 현재 문항" : ""}`} onClick={() => navigateToQuestion(index)}><strong>{question.questionNumber}</strong><span>{answered ? "응답" : "미응답"}</span>{response?.markedForReview && <em>검토</em>}</button><ExamResponseEditor question={question} response={response} compact disabled={session.status === "submitted" || expired} onChange={(value) => changeResponse(question.questionNumber, { response: value })} /></div>; })}</div>}
        </aside>
      </div>
      {session.status === "in_progress" && <nav className="real-exam-navigation" aria-label="실전 문항 이동"><button type="button" onClick={() => navigateToQuestion(safeCurrentQuestionIndex - 1)} disabled={safeCurrentQuestionIndex <= 0}>이전</button><span>{safeCurrentQuestionIndex + 1} / {session.questions.length}</span><button type="button" onClick={() => navigateToQuestion(safeCurrentQuestionIndex + 1)} disabled={safeCurrentQuestionIndex >= session.questions.length - 1}>다음</button></nav>}
      {score && <section className="real-exam-results" aria-label="채점 결과"><div className="real-exam-result-filters">{(["all", "wrong", "unanswered", "marked"] as const).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === "all" ? "전체" : item === "wrong" ? "오답" : item === "unanswered" ? "미응답" : "검토 표시"}</button>)}</div><div className="real-exam-result-cards"><span>전체 {score.totalQuestions}</span><span>응답 {score.answeredCount}</span><span>정답 {score.correctCount}</span><span>오답 {score.wrongCount}</span><span>미응답 {score.unansweredCount}</span><span>정답률 {score.percentCorrect}%</span></div>{score.pointsComplete ? <p>획득 점수 {score.earnedPoints} / {score.maxPoints}</p> : <p>배점 정보 일부 미확인</p>}<div className="real-exam-result-grid">{visibleQuestions.map((question) => { const result = score.questionResults.find((item) => item.questionNumber === question.questionNumber); return <button key={question.id} type="button" onClick={() => { setSelectedResultNumber(question.questionNumber); navigateToQuestion(session.questions.indexOf(question)); }}>{question.questionNumber} {result?.correct ? "✓" : result?.hasResponse ? "✕" : "-"}</button>; })}</div>{selectedResultNumber && (() => { const question = session.questions.find((item) => item.questionNumber === selectedResultNumber); const response = responses.get(selectedResultNumber); if (!question) return null; return <article className="real-exam-result-detail" aria-label={`${selectedResultNumber}번 결과 상세`}><h3>{selectedResultNumber}번 검사</h3><p>내 답: {response?.response || "미응답"}</p><p>정답: {question.correctAnswer || "정답 정보 없음"}</p>{question.explanation && <p>해설: {question.explanation}</p>}{typeof question.points === "number" && <p>배점: {question.points}점</p>}{question.warning && <p role="alert">주의: {question.warning}</p>}</article>; })()}</section>}
      <Dialog open={submitOpen} onClose={() => setSubmitOpen(false)} title="시험을 제출할까요?" closeDisabled={submitting} busy={submitting} footer={<div className="dialog-footer-actions"><button type="button" onClick={() => setSubmitOpen(false)} disabled={submitting}>계속 풀기</button><button type="button" onClick={() => void submit()} disabled={submitting}>그래도 제출</button></div>}><p>전체 {session.questions.length}문항 · 응답 {session.questions.length - unanswered.length}문항 · 미응답 {unanswered.length}문항 · 검토 표시 {marked.length}문항</p>{unanswered.length > 0 && <p role="alert">미응답 {unanswered.length}문항이 있습니다: {unanswered.join(", ")}</p>}</Dialog>
    </section>
  );
}
