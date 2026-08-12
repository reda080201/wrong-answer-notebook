import { useEffect, useMemo, useState } from "react";
import type { ExamPreferences, ExamSession } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";
import MathText from "../../../components/MathText";
import QuestionContentView from "../../../components/QuestionContentView";
import { isMultipleChoiceQuestion } from "../../../utils/structuredQuestionType";
import { scoreExamSession } from "../services/examScoring";
import { updateExamResponse } from "../services/examSession";
import { getRemainingExamSeconds, isExamExpired } from "../services/realExam";
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

export default function RealExamSessionView({ session, onChange, onSubmit, onSubmittingChange, examPreferences }: RealExamSessionViewProps) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [answerSheetOpen, setAnswerSheetOpen] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<"all" | "wrong" | "unanswered" | "marked">("all");
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

  const submit = async () => {
    setSubmitting(true);
    onSubmittingChange?.(true);
    try {
      await onSubmit(session);
      setSubmitOpen(false);
    } finally {
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
  };

  const visibleQuestions = score && filter !== "all"
    ? session.questions.filter((question) => {
      const result = score.questionResults.find((item) => item.questionNumber === question.questionNumber);
      return filter === "wrong" ? result?.hasResponse && !result.correct : filter === "unanswered" ? !result?.hasResponse : Boolean(result?.markedForReview);
    })
    : session.questions;

  const navigateToQuestion = (index: number, questionNumber: string) => {
    onChange({ ...session, currentQuestionIndex: index });
    document.getElementById(`real-exam-question-${questionNumber}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="real-exam-session" aria-label="실전 모의고사">
      <header className="real-exam-header">
        <div><span>실전 모드</span><h2>{session.title}</h2></div>
        <div className="real-exam-header-status">
          <strong aria-label="남은 시간">{session.deadlineAt && examPreferences?.showTimer !== false ? formatTime(remaining) : "시간 제한 없음"}</strong>
          <span>응답 {session.responses.filter((item) => item.response.trim()).length}/{session.questions.length}</span>
          <button type="button" onClick={() => setSubmitOpen(true)} disabled={session.status === "submitted" || submitting}>{submitting ? "제출 중..." : "시험 제출"}</button>
        </div>
      </header>
      {expired && session.status === "in_progress" && <div className="real-exam-expired" role="alert">시간이 종료되었습니다. 답안 입력을 잠그고 제출할 수 있습니다.</div>}
      <div className={`real-exam-layout${answerSheetOpen ? "" : " real-exam-layout--sheet-collapsed"}`}>
        <main className="real-exam-paper" aria-label="실전 시험지">
          {session.questions.map((question, index) => {
            const response = responses.get(question.questionNumber);
            const multipleChoice = isMultipleChoiceQuestion(question.questionType, question.choices);
            return (
              <article key={question.id} id={`real-exam-question-${question.questionNumber}`} className="real-exam-question">
                <header><h3>문제 {question.questionNumber}</h3><span>{index + 1} / {session.questions.length}</span></header>
                {question.warning && <p className="real-exam-warning">{question.warning}</p>}
                <QuestionContentView text={question.question} segments={question.contentSegments} figures={question.figures} />
                {multipleChoice ? <div className="real-exam-choices" role="group" aria-label={`${question.questionNumber}번 선택지`}>{question.choices.map((choice) => { const parsed = parseChoice(choice); const selected = response?.response === parsed.marker || response?.response === parsed.content; return <button key={choice} type="button" aria-pressed={selected} disabled={session.status === "submitted" || expired} onClick={() => changeResponse(question.questionNumber, { response: parsed.marker || parsed.content })}><b>{parsed.marker}</b><MathText text={parsed.content} /></button>; })}</div> : <label>답안<input value={response?.response ?? ""} disabled={session.status === "submitted" || expired} onChange={(event) => changeResponse(question.questionNumber, { response: event.target.value })} /></label>}
                <label className="real-exam-review"><input type="checkbox" checked={response?.markedForReview ?? false} disabled={session.status === "submitted" || expired} onChange={(event) => changeResponse(question.questionNumber, { markedForReview: event.target.checked })} /> 검토 표시</label>
              </article>
            );
          })}
        </main>
        <aside className="real-exam-answer-sheet" aria-label="답안지">
          <header><h3>답안지</h3><button type="button" onClick={() => setAnswerSheetOpen((value) => !value)}>{answerSheetOpen ? "접기" : "펼치기"}</button></header>
          {answerSheetOpen && <div className="real-exam-answer-grid">{session.questions.map((question, index) => { const response = responses.get(question.questionNumber); const answered = Boolean(response?.response.trim()); return <button key={question.id} type="button" className={`${answered ? "is-answered" : "is-unanswered"}${response?.markedForReview ? " is-marked" : ""}`} aria-label={`${question.questionNumber}번 ${answered ? "응답" : "미응답"}${response?.markedForReview ? ", 검토 표시" : ""}`} onClick={() => navigateToQuestion(index, question.questionNumber)}><strong>{question.questionNumber}</strong><span>{answered ? "응답" : "미응답"}</span>{response?.markedForReview && <em>⚑</em>}</button>; })}</div>}
        </aside>
      </div>
      {score && <section className="real-exam-results" aria-label="채점 결과"><div className="real-exam-result-filters">{(["all", "wrong", "unanswered", "marked"] as const).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === "all" ? "전체" : item === "wrong" ? "오답" : item === "unanswered" ? "미응답" : "검토 표시"}</button>)}</div><div className="real-exam-result-cards"><span>전체 {score.totalQuestions}</span><span>응답 {score.answeredCount}</span><span>정답 {score.correctCount}</span><span>오답 {score.wrongCount}</span><span>미응답 {score.unansweredCount}</span><span>정답률 {score.percentCorrect}%</span></div>{score.pointsComplete ? <p>획득 점수 {score.earnedPoints} / {score.maxPoints}</p> : <p>배점 정보 일부 미확인</p>}<div className="real-exam-result-grid">{visibleQuestions.map((question) => { const result = score.questionResults.find((item) => item.questionNumber === question.questionNumber); return <button key={question.id} type="button" onClick={() => document.getElementById(`real-exam-question-${question.questionNumber}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{question.questionNumber} {result?.correct ? "✓" : result?.hasResponse ? "✕" : "-"}</button>; })}</div></section>}
      <Dialog open={submitOpen} onClose={() => setSubmitOpen(false)} title="시험을 제출할까요?" closeDisabled={submitting} busy={submitting}><p>전체 {session.questions.length}문항 · 응답 {session.questions.length - unanswered.length}문항 · 미응답 {unanswered.length}문항 · 검토 표시 {marked.length}문항</p>{unanswered.length > 0 && <p role="alert">미응답 {unanswered.length}문항이 있습니다: {unanswered.join(", ")}</p>}<footer><button type="button" onClick={() => setSubmitOpen(false)} disabled={submitting}>계속 풀기</button><button type="button" onClick={() => void submit()} disabled={submitting}>그래도 제출</button></footer></Dialog>
    </section>
  );
}
