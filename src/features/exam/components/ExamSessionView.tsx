import { useMemo, useState } from "react";
import type { ExamSession } from "../../../types";
import { scoreExamSession } from "../services/examScoring";
import { updateExamResponse } from "../services/examSession";

interface ExamSessionViewProps {
  session: ExamSession;
  onChange: (session: ExamSession) => void;
  onSubmit: (session: ExamSession) => void;
  onAskGpt?: (payload: { question: string; response: string; scratchNote: string }) => void;
}

export default function ExamSessionView({ session, onChange, onSubmit, onAskGpt }: ExamSessionViewProps) {
  const [consentOpen, setConsentOpen] = useState(false);
  const question = session.questions[session.currentQuestionIndex];
  const response = session.responses.find((item) => item.questionNumber === question?.questionNumber);
  const score = useMemo(() => session.status === "submitted" ? scoreExamSession(session) : null, [session]);
  if (!question) return <section className="exam-session-empty">시험 문항이 없습니다.</section>;

  const update = (patch: { response?: string; scratchNote?: string; markedForReview?: boolean }) => {
    onChange(updateExamResponse(session, {
      questionNumber: question.questionNumber,
      response: patch.response ?? response?.response ?? "",
      scratchNote: patch.scratchNote ?? response?.scratchNote ?? "",
      markedForReview: patch.markedForReview ?? response?.markedForReview ?? false,
      updatedAt: new Date().toISOString(),
    }));
  };

  return <section className="exam-session-view" aria-label="모의고사 응시">
    <header className="exam-session-header">
      <div><h2>{session.title}</h2><p>{session.currentQuestionIndex + 1} / {session.questions.length}</p></div>
      <button type="button" onClick={() => onSubmit(session)} disabled={session.status === "submitted"}>제출</button>
    </header>
    <article className="exam-question-paper">
      <h3>문제 {question.questionNumber}</h3>
      {question.passage && <div className="exam-passage">{question.passage}</div>}
      <p className="exam-question-text">{question.question}</p>
      <ol>{question.choices.map((choice) => <li key={choice}>{choice}</li>)}</ol>
      <label>내 답<input value={response?.response ?? ""} onChange={(event) => update({ response: event.target.value })} disabled={session.status === "submitted"} /></label>
      <label>풀이 메모<textarea value={response?.scratchNote ?? ""} onChange={(event) => update({ scratchNote: event.target.value })} disabled={session.status === "submitted"} /></label>
      <label><input type="checkbox" checked={response?.markedForReview ?? false} onChange={(event) => update({ markedForReview: event.target.checked })} disabled={session.status === "submitted"} /> 검토 표시</label>
    </article>
    <nav className="exam-question-navigation"><button type="button" disabled={session.currentQuestionIndex === 0} onClick={() => onChange({ ...session, currentQuestionIndex: session.currentQuestionIndex - 1 })}>이전</button><button type="button" disabled={session.currentQuestionIndex >= session.questions.length - 1} onClick={() => onChange({ ...session, currentQuestionIndex: session.currentQuestionIndex + 1 })}>다음</button></nav>
    <div className="exam-gpt-actions">
      <button type="button" onClick={() => setConsentOpen(true)}>GPT에 질문</button>
      {consentOpen && <div role="dialog" aria-label="GPT 전송 동의">
        <p>현재 문제와 내 답, 풀이 메모를 GPT에 전송합니다.</p>
        <button type="button" onClick={() => { onAskGpt?.({ question: question.question, response: response?.response ?? "", scratchNote: response?.scratchNote ?? "" }); setConsentOpen(false); }}>전송</button>
        <button type="button" onClick={() => setConsentOpen(false)}>취소</button>
      </div>}
    </div>
    {score && <section aria-label="제출 결과">정답 {score.correctCount} / {score.totalQuestions}</section>}
  </section>;
}
