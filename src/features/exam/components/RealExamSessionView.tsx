import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExamPreferences, ExamSession } from "../../../types";
import MathText from "../../../components/MathText";
import Dialog from "../../../shared/ui/Dialog";
import { IconButton } from "../../../shared/ui";
import { PanelRightOpen, X } from "lucide-react";
import ExamSessionPaper, { type PaperResponsePatch } from "./ExamSessionPaper";
import { isMultipleChoiceQuestion } from "../../../utils/structuredQuestionType";
import { scoreExamSession } from "../services/examScoring";
import { updateExamResponse } from "../services/examSession";
import { getRemainingExamSeconds, isExamExpired } from "../services/realExam";
import ExamResponseEditor from "./ExamResponseEditor";
import { isInteractivePaperTarget, ownsPresentationNavigation } from "../../../components/ExamPaperCompositor";
import "./RealExamSessionView.css";

interface RealExamSessionViewProps {
  session: ExamSession;
  onChange(session: ExamSession): void;
  onUpdateSession?(recipe: (current: ExamSession) => ExamSession): void;
  onSubmit(session: ExamSession): void | Promise<void>;
  onSubmittingChange?(value: boolean): void;
  examPreferences?: ExamPreferences;
  onClose(): void;
  closeDisabled?: boolean;
  saveError?: string | null;
  saving?: boolean;
  onRetrySave?(): void;
  onStartReview?(numbers: string[]): void;
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

export default function RealExamSessionView({ session, onChange, onUpdateSession, onSubmit, onSubmittingChange, examPreferences, onClose, closeDisabled = false, saveError = null, saving = false, onRetrySave, onStartReview }: RealExamSessionViewProps) {
  const sessionRef = useRef(session);
  useEffect(() => {
    // Parent updates can commit in a later render than several rapid answer
    // clicks. Do not let an older in-progress prop overwrite the imperative
    // session that already contains those queued answers.
    if (sessionRef.current.id !== session.id || session.status === "submitted") {
      sessionRef.current = session;
    }
  }, [session.id, session.status]);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [answerSheetOpen, setAnswerSheetOpen] = useState(session.answerSheetOpen ?? examPreferences?.realExamAnswerSheetOpen ?? true);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<"all" | "wrong" | "unanswered" | "marked">("all");
  const selectedResultNumber = session.questions[session.currentQuestionIndex]?.questionNumber;
  const [deadlineWarning, setDeadlineWarning] = useState(false);
  const deadlineWarnedRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const expired = isExamExpired(session, new Date(now));
  const remaining = session.deadlineAt ? getRemainingExamSeconds(session.deadlineAt, new Date(now)) : 0;
  const score = session.status === "submitted" ? scoreExamSession(session) : null;
  const responses = useMemo(() => new Map(session.responses.map((item) => [item.questionNumber, item])), [session.responses]);
  const unanswered = session.questions.filter((question) => !responses.get(question.questionNumber)?.response.trim()).map((question) => question.questionNumber);
  const marked = session.questions.filter((question) => responses.get(question.questionNumber)?.markedForReview).map((question) => question.questionNumber);
  const currentQuestionIndex = session.currentQuestionIndex ?? 0;
  const safeCurrentQuestionIndex = Math.max(0, Math.min(currentQuestionIndex, session.questions.length - 1));
  const answerSheetLayout = resolveAnswerSheetLayout(session);

  useEffect(() => {
    if (session.status !== "in_progress" || !session.deadlineAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session.deadlineAt, session.status]);

  const updateSession = useCallback((recipe: (current: ExamSession) => ExamSession) => {
    const next = recipe(sessionRef.current);
    sessionRef.current = next;
    if (onUpdateSession) onUpdateSession(recipe);
    else onChange(next);
  }, [onChange, onUpdateSession]);

  const changeResponse = useCallback((questionNumber: string, patch: PaperResponsePatch) => {
    updateSession(latest => {
      if (latest.status === "submitted" || isExamExpired(latest)) return latest;
      const index = latest.questions.findIndex(question => question.questionNumber === questionNumber);
      if (index < 0) return latest;
      const previous = latest.responses.find(item => item.questionNumber === questionNumber);
      const next = updateExamResponse(latest, { questionNumber, response: patch.response ?? previous?.response ?? "", scratchNote: patch.scratchNote ?? previous?.scratchNote ?? "", markedForReview: patch.markedForReview ?? previous?.markedForReview ?? false, updatedAt: new Date().toISOString() });
      const advance = patch.response !== undefined && examPreferences?.autoAdvanceOnAnswer && isMultipleChoiceQuestion(latest.questions[index].questionType, latest.questions[index].choices);
      return { ...next, currentQuestionIndex: advance ? Math.min(index + 1, latest.questions.length - 1) : index };
    });
  }, [examPreferences?.autoAdvanceOnAnswer, updateSession]);

  const submit = useCallback(async () => {
    if (submittingRef.current || sessionRef.current.status === "submitted") return;
    submittingRef.current = true;
    setSubmitting(true);
    onSubmittingChange?.(true);
    setSubmitError(null);
    try {
      await onSubmit(sessionRef.current);
      setSubmitOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "시험을 저장/제출하지 못했습니다. 다시 시도해 주세요.");
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
    updateSession((latest) => ({ ...latest, currentQuestionIndex: index }));
  }, [updateSession]);

  useEffect(() => {
    if (sessionRef.current.status !== "in_progress") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || ownsPresentationNavigation(examPreferences?.paperPresentation, examPreferences?.paperNavigation) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isInteractivePaperTarget(event.target)) return;
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
  }, [examPreferences?.paperNavigation, examPreferences?.paperPresentation, navigateToQuestion, safeCurrentQuestionIndex]);

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
      {submitError && <div className="exam-session-save-error" role="alert"><span>시험을 저장/제출하지 못했습니다: {submitError}</span><button type="button" onClick={() => void submit()} disabled={submitting}>다시 제출</button></div>}
      {expired && session.status === "in_progress" && <div className="real-exam-expired" role="alert">시간이 종료되었습니다. 답안 입력을 잠그고 제출할 수 있습니다.</div>}
      {deadlineWarning && !expired && <div className="real-exam-warning" role="status">시험 종료까지 5분 이내입니다.</div>}
      <div className={`real-exam-layout${answerSheetOpen ? "" : " real-exam-layout--sheet-collapsed"}`}>
        <main className="real-exam-paper" aria-label="실전 시험지">
      {score && <section className="real-exam-results" aria-label="채점 결과"><div className="real-exam-result-filters">{(["all", "wrong", "unanswered", "marked"] as const).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === "all" ? "전체" : item === "wrong" ? "오답" : item === "unanswered" ? "미응답" : "검토 표시"}</button>)}</div><button type="button" disabled={!onStartReview || !score.questionResults.some(item => item.hasResponse && !item.correct)} onClick={() => onStartReview?.(score.questionResults.filter(item => item.hasResponse && !item.correct).map(item => item.questionNumber))}>오답 복습 시작</button><div className="real-exam-result-cards"><span>전체 {score.totalQuestions}</span><span>응답 {score.answeredCount}</span><span>정답 {score.correctCount}</span><span>오답 {score.wrongCount}</span><span>미응답 {score.unansweredCount}</span><span>정답률 {score.percentCorrect}%</span></div>{score.pointsComplete ? <p>획득 점수 {score.earnedPoints} / {score.maxPoints}</p> : <p>배점 정보 일부 미확인</p>}<div className="real-exam-result-grid">{visibleQuestions.map((question) => { const result = score.questionResults.find((item) => item.questionNumber === question.questionNumber); return <button key={question.id} type="button" onClick={() => { navigateToQuestion(session.questions.indexOf(question)); }}>{question.questionNumber} {result?.correct ? "✓" : result?.hasResponse ? "✕" : "-"}</button>; })}</div>{selectedResultNumber && (() => { const question = session.questions.find((item) => item.questionNumber === selectedResultNumber); const response = responses.get(selectedResultNumber); if (!question) return null; return <article className="real-exam-result-detail" aria-label={`${selectedResultNumber}번 결과 상세`}><h3>{selectedResultNumber}번 검사</h3><p>내 답: <MathText text={response?.response || "미응답"} /></p><p>정답: <MathText text={question.correctAnswer || "정답 정보 없음"} /></p>{question.explanation && <p>해설: <MathText text={question.explanation} /></p>}{typeof question.points === "number" && <p>배점: {question.points}점</p>}{question.warning && <p role="alert">주의: {question.warning}</p>}</article>; })()}</section>}
          <ExamSessionPaper session={session} preferences={examPreferences} disabled={session.status === "submitted" || expired} onNavigate={navigateToQuestion} onResponse={changeResponse} onSessionChange={updateSession} />
        </main>
        <aside className="real-exam-answer-sheet" aria-label="답안지">
          {answerSheetOpen ? <header><h3>답안지</h3><button type="button" onClick={toggleAnswerSheet} aria-label="답안지 접기">접기</button></header> : <div className="real-exam-answer-sheet-rail"><IconButton label="답안지 펼치기" onClick={toggleAnswerSheet}><PanelRightOpen size={20} /></IconButton></div>}
          {answerSheetOpen && <div className={`real-exam-answer-grid real-exam-answer-grid--${answerSheetLayout}`}>{session.questions.map((question, index) => { const response = responses.get(question.questionNumber); const answered = Boolean(response?.response.trim()); const current = index === safeCurrentQuestionIndex; return <div key={question.id} className={`real-exam-answer-item ${answered ? "is-answered" : "is-unanswered"}${current ? " is-current" : ""}${response?.markedForReview ? " is-marked" : ""}`}><button type="button" className="real-exam-answer-jump" aria-current={current ? "step" : undefined} aria-label={`${question.questionNumber}번 ${answered ? "응답" : "미응답"}${response?.markedForReview ? ", 검토 표시" : ""}${current ? ", 현재 문항" : ""}`} onClick={() => navigateToQuestion(index)}><strong>{question.questionNumber}</strong><span className="real-exam-answer-status-dot" aria-hidden="true" /><span className="real-exam-answer-status-label">{answered ? "응답" : "미응답"}</span>{response?.markedForReview && <em>검토</em>}</button><ExamResponseEditor question={question} response={response} compact disabled={session.status === "submitted" || expired} onChange={(value) => changeResponse(question.questionNumber, { response: value })} /></div>; })}</div>}
        </aside>
      </div>
      {session.status === "in_progress" && <nav className="real-exam-navigation" aria-label="실전 문항 이동"><button type="button" onClick={() => navigateToQuestion(safeCurrentQuestionIndex - 1)} disabled={safeCurrentQuestionIndex <= 0}>이전</button><span>{safeCurrentQuestionIndex + 1} / {session.questions.length}</span><button type="button" onClick={() => navigateToQuestion(safeCurrentQuestionIndex + 1)} disabled={safeCurrentQuestionIndex >= session.questions.length - 1}>다음</button></nav>}

      <Dialog open={submitOpen} onClose={() => setSubmitOpen(false)} title="시험을 제출할까요?" closeDisabled={submitting} busy={submitting} footer={<div className="dialog-footer-actions"><button type="button" onClick={() => setSubmitOpen(false)} disabled={submitting}>계속 풀기</button><button type="button" onClick={() => void submit()} disabled={submitting}>제출하고 채점</button></div>}><p>전체 {session.questions.length}문항 · 응답 {session.questions.length - unanswered.length}문항 · 미응답 {unanswered.length}문항 · 검토 표시 {marked.length}문항</p>{unanswered.length > 0 && <p role="alert">미응답 {unanswered.length}문항이 있습니다: {unanswered.join(", ")}</p>}</Dialog>
    </section>
  );
}
