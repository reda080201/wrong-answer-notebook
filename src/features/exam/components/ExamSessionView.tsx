import { useMemo, useState } from "react";
import type { ExamSession } from "../../../types";
import { scoreExamSession } from "../services/examScoring";
import { updateExamResponse } from "../services/examSession";
import MathText from "../../../components/MathText";
import ZoomableImageViewer from "../../../components/ZoomableImageViewer";
import { splitMarkdownTableSegments } from "../../../utils/textLayout";

interface ExamSessionViewProps {
  session: ExamSession;
  onChange: (session: ExamSession) => void;
  onSubmit: (session: ExamSession) => void | Promise<void>;
  onAskGpt?: (payload: { question: string; response: string; scratchNote: string }) => void;
}

function ExamText({ text }: { text: string }) {
  return <>
    {splitMarkdownTableSegments(text).map((segment, index) =>
      typeof segment === "string" ? (
        <p key={`${index}-${segment.slice(0, 16)}`}><MathText text={segment} /></p>
      ) : (
        <div className="exam-markdown-table-wrap" key={`table-${index}`}>
          <table>
            <tbody>
              {segment.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><MathText text={cell} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    )}
  </>;
}

export default function ExamSessionView({ session, onChange, onSubmit, onAskGpt }: ExamSessionViewProps) {
  const [consentOpen, setConsentOpen] = useState(false);
  const question = session.questions[session.currentQuestionIndex];
  const response = session.responses.find((item) => item.questionNumber === question?.questionNumber);
  const imageFilenames = question
    ? [...new Set([...question.questionImages, ...question.figures.flatMap((figure) => figure.image ? [figure.image] : [])])]
    : [];
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
      <button type="button" onClick={() => void onSubmit(session)} disabled={session.status === "submitted"}>제출</button>
    </header>
    <article className="exam-question-paper">
      <h3>문제 {question.questionNumber}</h3>
      {question.passage && <div className="exam-passage"><ExamText text={question.passage} /></div>}
      <div className="exam-question-text"><ExamText text={question.question} /></div>
      <ol>{question.choices.map((choice) => <li key={choice}><MathText text={choice} /></li>)}</ol>
      {imageFilenames.length > 0 && <section className="exam-question-images" aria-label="문제 이미지"><ZoomableImageViewer filenames={imageFilenames} /></section>}
      {(question.sourcePageImages?.length ?? 0) > 0 && <details className="exam-source-pages"><summary>원본 페이지 보기</summary><ZoomableImageViewer filenames={question.sourcePageImages ?? []} /></details>}
      <label>내 답<input value={response?.response ?? ""} onChange={(event) => update({ response: event.target.value })} disabled={session.status === "submitted"} /></label>
      <label>풀이 메모<textarea value={response?.scratchNote ?? ""} onChange={(event) => update({ scratchNote: event.target.value })} disabled={session.status === "submitted"} /></label>
      <label><input type="checkbox" checked={response?.markedForReview ?? false} onChange={(event) => update({ markedForReview: event.target.checked })} disabled={session.status === "submitted"} /> 검토 표시</label>
    </article>
    <nav className="exam-question-navigation"><button type="button" disabled={session.currentQuestionIndex === 0} onClick={() => onChange({ ...session, currentQuestionIndex: session.currentQuestionIndex - 1 })}>이전</button><button type="button" disabled={session.currentQuestionIndex >= session.questions.length - 1} onClick={() => onChange({ ...session, currentQuestionIndex: session.currentQuestionIndex + 1 })}>다음</button></nav>
    <div className="exam-gpt-actions">
      <button type="button" onClick={() => setConsentOpen(true)}>{onAskGpt ? "GPT에 질문" : "MCP 연결 안내"}</button>
      {consentOpen && <div role="dialog" aria-label="GPT 전송 동의">
        <p>{onAskGpt ? "현재 문제와 내 답, 풀이 메모를 GPT에 전송합니다." : "현재 문제는 로컬 MCP 브리지에만 공개됩니다. ChatGPT 직접 연결과 tunnel helper 자동 설정은 아직 지원하지 않습니다."}</p>
        {onAskGpt && <button type="button" onClick={() => { onAskGpt({ question: question.question, response: response?.response ?? "", scratchNote: response?.scratchNote ?? "" }); setConsentOpen(false); }}>전송</button>}
        <button type="button" onClick={() => setConsentOpen(false)}>취소</button>
      </div>}
    </div>
    {score && <section aria-label="제출 결과">정답 {score.correctCount} / {score.totalQuestions}</section>}
  </section>;
}
