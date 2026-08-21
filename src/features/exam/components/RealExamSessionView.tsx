import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExamAnswerSheetLayout, ExamPreferences, ExamSession } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";
import MathText from "../../../components/MathText";
import QuestionContentView from "../../../components/QuestionContentView";
import { isMultipleChoiceQuestion } from "../../../utils/structuredQuestionType";
import { scoreExamSession } from "../services/examScoring";
import { updateExamResponse } from "../services/examSession";
import { getRemainingExamSeconds, isExamExpired } from "../services/realExam";
import { sanitizeExamQuestionDomId } from "../services/examDom";
import { parseChoice } from "./ExamSessionView";
import "./RealExamSessionView.css";

interface RealExamSessionViewProps {
  session: ExamSession;
  onChange(session: ExamSession): void;
  onSubmit(session: ExamSession): void | Promise<void>;
  onSubmittingChange?(value: boolean): void;
  examPreferences?: ExamPreferences;
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function resolveAnswerSheetLayout(
  requested: ExamAnswerSheetLayout,
  questions: ExamSession["questions"],
  subject: string,
): Exclude<ExamAnswerSheetLayout, "auto"> {
  if (requested !== "auto") return requested;
  const containsWrittenResponse = questions.some((question) => !isMultipleChoiceQuestion(question.questionType, question.choices));
  return containsWrittenResponse || /수학|math/i.test(subject) ? "vertical" : "horizontal";
}

function ignoresNavigationShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='dialog']"));
}

export default function RealExamSessionView({ session, onChange, onSubmit, onSubmittingChange, examPreferences }: RealExamSessionViewProps) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [answerSheetOpen, setAnswerSheetOpen] = useState(session.answerSheetOpen ?? examPreferences?.realExamAnswerSheetOpen ?? true);
  const answerSheetLayout: ExamAnswerSheetLayout = session.answerSheetLayout ?? examPreferences?.defaultAnswerSheetLayout ?? "auto";
  const resolvedAnswerSheetLayout = resolveAnswerSheetLayout(answerSheetLayout, session.questions, session.subject);
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

  useEffect(() => {
    if (session.status !== "in_progress" || !session.deadlineAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session.deadlineAt, session.status]);

  useEffect(() => {
    setAnswerSheetOpen(session.answerSheetOpen ?? examPreferences?.realExamAnswerSheetOpen ?? true);
  }, [examPreferences?.realExamAnswerSheetOpen, session.id, session.answerSheetOpen]);

  const changeResponse = (questionNumber: string, patch: { response?: string; markedForReview?: boolean }) => {
    const current = responses.get(questionNumber);
    onChange(updateExamResponse(session, {
      questionNumber,
      response: patch.response ?? current?.response ?? "",
      scratchNote: current?.scratchNote ?? "",
      markedForReview: patch.markedForReview ?? current?.markedForReview ?? false,
      updatedAt: new Date().toISOString(),
    }));
  };

  const submit = useCallback(async () => {
    if (submittingRef.current || session.status === "submitted") return;
    submittingRef.current = true;
    setSubmitting(true);
    onSubmittingChange?.(true);
    try {
      await onSubmit(session);
      setSubmitOpen(false);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
  }, [onSubmit, onSubmittingChange, session]);

  useEffect(() => {
    if (session.status !== "in_progress" || !session.deadlineAt) return;
    if (examPreferences?.warnBeforeEnd !== false && remaining > 0 && remaining <= 300 && !deadlineWarnedRef.current) {
      deadlineWarnedRef.current = true;
      setDeadlineWarning(true);
    }
    if (expired && examPreferences?.autoSubmitOnTimeExpired && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      void submit();
    }
    if (!expired) autoSubmittedRef.current = false;
  }, [examPreferences?.autoSubmitOnTimeExpired, examPreferences?.warnBeforeEnd, expired, remaining, session.deadlineAt, session.status, submit]);

  const visibleQuestions = score && filter !== "all"
    ? session.questions.filter((question) => {
      const result = score.questionResults.find((item) => item.questionNumber === question.questionNumber);
      return filter === "wrong" ? result?.hasResponse && !result.correct : filter === "unanswered" ? !result?.hasResponse : Boolean(result?.markedForReview);
    })
    : session.questions;
  const activeQuestion = session.questions[session.currentQuestionIndex] ?? session.questions[0];
  const displayedQuestions = session.status === "submitted"
    ? visibleQuestions
    : session.questions.filter((question) => !activeQuestion?.stimulusGroupId
      ? question.questionNumber === activeQuestion?.questionNumber
      : question.stimulusGroupId === activeQuestion.stimulusGroupId);

  const navigateToIndex = useCallback((requestedIndex: number, scroll = true) => {
    const nextIndex = Math.max(0, Math.min(session.questions.length - 1, requestedIndex));
    const nextQuestion = session.questions[nextIndex];
    if (!nextQuestion || nextIndex === session.currentQuestionIndex) return;
    if (scroll) pendingScrollQuestionRef.current = nextQuestion.questionNumber;
    onChange({ ...session, currentQuestionIndex: nextIndex });
  }, [onChange, session]);

  useEffect(() => {
    const questionNumber = pendingScrollQuestionRef.current;
    if (!questionNumber) return;
    pendingScrollQuestionRef.current = null;
    document.getElementById(sanitizeExamQuestionDomId(questionNumber))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [session.currentQuestionIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || ignoresNavigationShortcut(event.target)) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      const nextIndex = session.currentQuestionIndex + delta;
      if (nextIndex < 0 || nextIndex >= session.questions.length) return;
      event.preventDefault();
      navigateToIndex(nextIndex);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateToIndex, session.currentQuestionIndex, session.questions.length]);

  const navigateToQuestion = (index: number) => navigateToIndex(index);

  const toggleAnswerSheet = () => {
    const next = !answerSheetOpen;
    setAnswerSheetOpen(next);
    onChange({ ...session, answerSheetOpen: next });
  };

  const answerSheetControl = (question: ExamSession["questions"][number]) => {
    const response = responses.get(question.questionNumber);
    const disabled = session.status === "submitted" || expired;
    if (isMultipleChoiceQuestion(question.questionType, question.choices)) {
      return <div className="real-exam-answer-sheet-choices" role="group" aria-label={`${question.questionNumber}번 답안 선택`}>
        {question.choices.map((choice) => {
          const parsed = parseChoice(choice);
          const selected = response?.response === parsed.marker || response?.response === parsed.content;
          return <button key={choice} type="button" aria-pressed={selected} disabled={disabled} onClick={() => changeResponse(question.questionNumber, { response: parsed.marker || parsed.content })}>{parsed.marker}</button>;
        })}
      </div>;
    }
    return question.questionType === "essay"
      ? <textarea aria-label={`${question.questionNumber}번 답안`} value={response?.response ?? ""} disabled={disabled} onChange={(event) => changeResponse(question.questionNumber, { response: event.target.value })} />
      : <input aria-label={`${question.questionNumber}번 답안`} value={response?.response ?? ""} disabled={disabled} onChange={(event) => changeResponse(question.questionNumber, { response: event.target.value })} />;
  };

  const answerSheetItem = (question: ExamSession["questions"][number], index: number) => {
    const response = responses.get(question.questionNumber);
    const answered = Boolean(response?.response.trim());
    return <div key={question.id} className={`real-exam-answer-item ${answered ? "is-answered" : "is-unanswered"}${response?.markedForReview ? " is-marked" : ""}`}>
      <button type="button" className="real-exam-answer-jump" aria-label={`${question.questionNumber}번 ${answered ? "응답" : "미응답"}${response?.markedForReview ? ", 검토 표시" : ""}`} onClick={() => navigateToQuestion(index)}>
        <strong>{question.questionNumber}</strong><span>{answered ? "응답" : "미응답"}</span>{response?.markedForReview && <em aria-label="검토 표시">검토</em>}
      </button>
      {answerSheetControl(question)}
    </div>;
  };

  const answerSheet = resolvedAnswerSheetLayout === "vertical"
    ? <ol className="real-exam-answer-grid real-exam-answer-grid--vertical" data-layout="vertical" aria-label="세로 답안지">{session.questions.map((question, index) => <li key={question.id}>{answerSheetItem(question, index)}</li>)}</ol>
    : <div className="real-exam-answer-grid real-exam-answer-grid--horizontal" data-layout="horizontal" role="list" aria-label="가로 답안지">{session.questions.map((question, index) => <div key={question.id} role="listitem">{answerSheetItem(question, index)}</div>)}</div>;

  return (
    <section className="real-exam-session" aria-label="실전 모의고사">
      <header className="real-exam-header">
        <div><span>실전 모드</span><h2>{session.title}</h2></div>
        <div className="real-exam-header-status">
          <strong aria-label="남은 시간">{session.deadlineAt && session.showTimer !== false && examPreferences?.showTimer !== false ? formatTime(remaining) : "시간 제한 없음"}</strong>
          <span>응답 {session.responses.filter((item) => item.response.trim()).length}/{session.questions.length}</span>
          <button type="button" onClick={() => setSubmitOpen(true)} disabled={session.status === "submitted" || submitting}>{submitting ? "제출 중..." : "시험 제출"}</button>
        </div>
      </header>
      {expired && session.status === "in_progress" && <div className="real-exam-expired" role="alert">시간이 종료되었습니다. 답안 입력을 잠그고 제출할 수 있습니다.</div>}
      {deadlineWarning && !expired && <div className="real-exam-warning" role="status">시험 종료까지 5분 이내입니다.</div>}
      <div className={`real-exam-layout${answerSheetOpen ? "" : " real-exam-layout--sheet-collapsed"}`}>
        <main className="real-exam-paper" aria-label="실전 시험지">
          {displayedQuestions.map((question) => {
            const index = session.questions.indexOf(question);
            const response = responses.get(question.questionNumber);
            const multipleChoice = isMultipleChoiceQuestion(question.questionType, question.choices);
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
                {multipleChoice ? <div className="real-exam-choices" role="group" aria-label={`${question.questionNumber}번 선택지`}>{question.choices.map((choice) => { const parsed = parseChoice(choice); const selected = response?.response === parsed.marker || response?.response === parsed.content; return <button key={choice} type="button" aria-pressed={selected} disabled={session.status === "submitted" || expired} onClick={() => changeResponse(question.questionNumber, { response: parsed.marker || parsed.content })}><b>{parsed.marker}</b><MathText text={parsed.content} /></button>; })}</div> : <label>답안<input value={response?.response ?? ""} disabled={session.status === "submitted" || expired} onChange={(event) => changeResponse(question.questionNumber, { response: event.target.value })} /></label>}
                <label className="real-exam-review"><input type="checkbox" checked={response?.markedForReview ?? false} disabled={session.status === "submitted" || expired} onChange={(event) => changeResponse(question.questionNumber, { markedForReview: event.target.checked })} /> 검토 표시</label>
              </article>
            );
          })}
          {session.status === "in_progress" && activeQuestion && (
            <footer className="real-exam-navigation" aria-label="문항 이동">
              <button type="button" onClick={() => navigateToIndex(session.currentQuestionIndex - 1)} disabled={session.currentQuestionIndex === 0}>이전</button>
              <span aria-live="polite">현재 {activeQuestion.questionNumber}번 · {session.currentQuestionIndex + 1} / {session.questions.length}</span>
              <button type="button" onClick={() => navigateToIndex(session.currentQuestionIndex + 1)} disabled={session.currentQuestionIndex >= session.questions.length - 1}>다음</button>
            </footer>
          )}
        </main>
        <aside className="real-exam-answer-sheet" aria-label="답안지">
          <header><h3>답안지</h3><button type="button" onClick={toggleAnswerSheet}>{answerSheetOpen ? "접기" : "펼치기"}</button></header>
          {answerSheetOpen && answerSheet}
        </aside>
      </div>
      {score && <section className="real-exam-results" aria-label="채점 결과"><div className="real-exam-result-filters">{(["all", "wrong", "unanswered", "marked"] as const).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === "all" ? "전체" : item === "wrong" ? "오답" : item === "unanswered" ? "미응답" : "검토 표시"}</button>)}</div><div className="real-exam-result-cards"><span>전체 {score.totalQuestions}</span><span>응답 {score.answeredCount}</span><span>정답 {score.correctCount}</span><span>오답 {score.wrongCount}</span><span>미응답 {score.unansweredCount}</span><span>정답률 {score.percentCorrect}%</span></div>{score.pointsComplete ? <p>획득 점수 {score.earnedPoints} / {score.maxPoints}</p> : <p>배점 정보 일부 미확인</p>}<div className="real-exam-result-grid">{visibleQuestions.map((question) => { const result = score.questionResults.find((item) => item.questionNumber === question.questionNumber); return <button key={question.id} type="button" onClick={() => { setSelectedResultNumber(question.questionNumber); navigateToQuestion(session.questions.indexOf(question), question.questionNumber); }}>{question.questionNumber} {result?.correct ? "✓" : result?.hasResponse ? "✕" : "-"}</button>; })}</div>{selectedResultNumber && (() => { const question = session.questions.find((item) => item.questionNumber === selectedResultNumber); const response = responses.get(selectedResultNumber); if (!question) return null; return <article className="real-exam-result-detail" aria-label={`${selectedResultNumber}번 결과 상세`}><h3>{selectedResultNumber}번 검사</h3><p>내 답: {response?.response || "미응답"}</p><p>정답: {question.correctAnswer || "정답 정보 없음"}</p>{question.explanation && <p>해설: {question.explanation}</p>}{typeof question.points === "number" && <p>배점: {question.points}점</p>}{question.warning && <p role="alert">주의: {question.warning}</p>}</article>; })()}</section>}
      <Dialog open={submitOpen} onClose={() => setSubmitOpen(false)} title="시험을 제출할까요?" size="sm" closeDisabled={submitting} busy={submitting} footer={<><button type="button" data-dialog-initial-focus onClick={() => setSubmitOpen(false)} disabled={submitting}>계속 풀기</button><button type="button" onClick={() => void submit()} disabled={submitting}>그래도 제출</button></>}><p>전체 {session.questions.length}문항 · 응답 {session.questions.length - unanswered.length}문항 · 미응답 {unanswered.length}문항 · 검토 표시 {marked.length}문항</p>{unanswered.length > 0 && <p role="alert">미응답 {unanswered.length}문항이 있습니다: {unanswered.join(", ")}</p>}</Dialog>
    </section>
  );
}
