import { useMemo, useRef, useState } from "react";
import type { ChatGptMcpPreferences, ExamPreferences, ExamSession } from "../../../types";
import type { SettingsTab } from "../../../components/SettingsModal";
import { scoreExamSession } from "../services/examScoring";
import { updateExamResponse } from "../services/examSession";
import QuestionContentView from "../../../components/QuestionContentView";
import ZoomableImageViewer from "../../../components/ZoomableImageViewer";
import ChatGptHelpLauncher from "../../chatgpt/components/ChatGptHelpLauncher";

interface ExamSessionViewProps {
  session: ExamSession;
  onChange: (session: ExamSession) => void;
  onSubmit: (session: ExamSession) => void | Promise<void>;
  onSubmittingChange?: (submitting: boolean) => void;
  onAskGpt?: (payload: { question: string; response: string; scratchNote: string }) => void;
  examPreferences?: ExamPreferences;
  onOpenSettings?: (tab?: SettingsTab) => void;
  chatGptPreferences?: ChatGptMcpPreferences;
  onChatGptPreferencesChange?: (patch: Partial<ChatGptMcpPreferences>) => Promise<void> | void;
  onSyncChatGptContext?: (sharing: Pick<ChatGptMcpPreferences, "shareUserResponse" | "shareScratchNote" | "shareQuestionImages" | "shareSourcePageImages">) => Promise<void>;
  onOpenChatGptSettings?: () => void;
  onCheckLocalMcp?: () => Promise<void>;
  remoteMcpConfigured?: boolean;
}

export function parseChoice(choice: string) {
  const match = choice.trim().match(/^(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|\(\d{1,2}\)|\d{1,2}\)|[A-Ea-e][.)])\s*(.*)$/);
  return match ? { marker: match[1], content: match[2] } : { marker: "", content: choice };
}

function ExamHelpDialog({ onClose }: { onClose: () => void }) {
  return <div className="exam-dialog-backdrop" role="presentation"><section className="exam-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-help-title"><header><h3 id="exam-help-title">시험 도움말</h3><button type="button" aria-label="시험 도움말 닫기" onClick={onClose}>닫기</button></header><ul><li>객관식은 선택지를 누르고, 주관식은 답안을 입력합니다.</li><li>풀이 메모는 답안과 별도로 남기며 제출 전까지 수정할 수 있습니다.</li><li>검토 표시는 다시 확인할 문항을 표시합니다.</li><li>이전/다음으로 이동해도 작성한 답은 저장됩니다.</li><li>시험 제출 후에는 답안을 수정할 수 없고 채점 결과가 표시됩니다.</li><li>MCP 도움은 로컬 브리지로 현재 문제를 읽게 하는 기능입니다.</li><li>문항 그림은 문제에 직접 연결된 그림이며, 원본 페이지는 별도 자료입니다.</li></ul></section></div>;
}

export default function ExamSessionView({ session, onChange, onSubmit, onSubmittingChange, onAskGpt, examPreferences, onOpenSettings, chatGptPreferences, onChatGptPreferencesChange, onSyncChatGptContext, onOpenChatGptSettings, onCheckLocalMcp, remoteMcpConfigured }: ExamSessionViewProps) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const question = session.questions[session.currentQuestionIndex];
  const response = session.responses.find((item) => item.questionNumber === question?.questionNumber);
  const score = useMemo(() => session.status === "submitted" ? scoreExamSession(session) : null, [session]);
  if (!question) return <section className="exam-session-empty">시험 문항이 없습니다.</section>;
  const isSubmitted = session.status === "submitted";
  const unanswered = session.questions.filter((item) => !session.responses.find((responseItem) => responseItem.questionNumber === item.questionNumber)?.response.trim()).map((item) => item.questionNumber);
  const marked = session.responses.filter((item) => item.markedForReview).map((item) => item.questionNumber);
  const update = (patch: { response?: string; scratchNote?: string; markedForReview?: boolean }) => onChange(updateExamResponse(session, { questionNumber: question.questionNumber, response: patch.response ?? response?.response ?? "", scratchNote: patch.scratchNote ?? response?.scratchNote ?? "", markedForReview: patch.markedForReview ?? response?.markedForReview ?? false, updatedAt: new Date().toISOString() }));
  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    onSubmittingChange?.(true);
    setSubmitError(null);
    try {
      await onSubmit(session);
      setSubmitOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "시험을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
  };
  const isMultipleChoice = question.choices.length > 0 && question.choices.every((choice) => Boolean(parseChoice(choice).marker));
  const showNavigator = examPreferences?.showNavigator !== false;
  const warnUnanswered = examPreferences?.warnUnansweredOnSubmit !== false;
  const autoAdvance = examPreferences?.autoAdvanceOnAnswer === true;
  const selectChoice = (value: string) => {
    const nextSession = updateExamResponse(session, {
      questionNumber: question.questionNumber,
      response: value,
      scratchNote: response?.scratchNote ?? "",
      markedForReview: response?.markedForReview ?? false,
      updatedAt: new Date().toISOString(),
    });
    if (!isSubmitted && autoAdvance && session.currentQuestionIndex < session.questions.length - 1) {
      onChange({ ...nextSession, currentQuestionIndex: session.currentQuestionIndex + 1 });
    } else {
      onChange(nextSession);
    }
  };

  return <section className="exam-session-view" aria-label="모의고사 응시">
    <header className="exam-session-header"><div><p className="exam-eyebrow">모의고사</p><h2>{session.title}</h2></div><div className="exam-header-actions">{onOpenSettings && <button type="button" className="btn-secondary" onClick={() => onOpenSettings("exam")}>설정</button>}<button type="button" className="btn-secondary" onClick={() => setHelpOpen(true)}>시험 도움말</button><button type="button" title="답안을 확정하고 채점합니다. 제출 후에는 답안을 수정할 수 없습니다." onClick={() => setSubmitOpen(true)} disabled={isSubmitted || submitting}>{submitting ? "제출 중…" : "시험 제출"}</button></div></header>
    <article className="exam-question-paper"><header className="exam-question-heading"><span>문제 {question.questionNumber}</span><span>{session.currentQuestionIndex + 1} / {session.questions.length}</span></header>{question.passage && <section className="exam-passage"><QuestionContentView text={question.passage} /></section>}<QuestionContentView text={question.question} segments={question.contentSegments} figures={question.figures} />
      {isMultipleChoice ? <div className="exam-choice-list" role="group" aria-label="선택지">{question.choices.map((choice) => { const parsed = parseChoice(choice); const selected = response?.response === parsed.marker || response?.response === parsed.content; return <button type="button" key={choice} className={selected ? "exam-choice is-selected" : "exam-choice"} aria-pressed={selected} disabled={isSubmitted} onClick={() => selectChoice(parsed.marker || parsed.content)}><span className="choice-marker">{parsed.marker}</span><span className="choice-content">{parsed.content}</span></button>; })}</div> : <label className="exam-answer-field">내 답<input value={response?.response ?? ""} onChange={(event) => update({ response: event.target.value })} disabled={isSubmitted} /></label>}
      {(examPreferences?.showOriginalPages !== false) && (question.sourcePageImages?.length ?? 0) > 0 && <details className="exam-source-pages"><summary>원본 페이지 보기</summary><ZoomableImageViewer filenames={question.sourcePageImages ?? []} /></details>}
      {examPreferences?.showScratchNote !== false && <label className="exam-note-field">풀이 메모<textarea value={response?.scratchNote ?? ""} onChange={(event) => update({ scratchNote: event.target.value })} disabled={isSubmitted} /></label>}
    </article>
    {showNavigator && <nav className="exam-question-navigation" aria-label="문항 이동"><button type="button" disabled={session.currentQuestionIndex === 0} onClick={() => onChange({ ...session, currentQuestionIndex: session.currentQuestionIndex - 1 })}>이전</button><span>{session.currentQuestionIndex + 1} / {session.questions.length}</span><label><input type="checkbox" checked={response?.markedForReview ?? false} onChange={(event) => update({ markedForReview: event.target.checked })} disabled={isSubmitted} /> 검토 표시</label><button type="button" disabled={session.currentQuestionIndex >= session.questions.length - 1} onClick={() => onChange({ ...session, currentQuestionIndex: session.currentQuestionIndex + 1 })}>다음</button></nav>}
    {(examPreferences?.showMcpHelp !== false) && chatGptPreferences && onChatGptPreferencesChange && onSyncChatGptContext && (
      <aside className="exam-gpt-actions">
        <ChatGptHelpLauncher
          mode={isSubmitted ? "submitted" : "pre-submit"}
          preferences={chatGptPreferences}
          onPreferencesChange={onChatGptPreferencesChange}
          onSyncContext={onSyncChatGptContext}
          onOpenSettings={onOpenChatGptSettings}
          onCheckLocalMcp={onCheckLocalMcp}
          remoteMcpConfigured={remoteMcpConfigured}
          label="ChatGPT 도움"
        />
      </aside>
    )}
    {score && <section className="exam-result-summary" aria-live="polite"><h3>채점 결과</h3><p>정답 {score.correctCount} / {score.totalQuestions} · 정답률 {score.percentCorrect}%</p><p>틀린 문항: {score.questionResults.filter((item) => !item.correct).map((item) => item.questionNumber).join(", ") || "없음"}</p><p>미응답: {unanswered.join(", ") || "없음"} · 검토 표시: {marked.join(", ") || "없음"}</p></section>}
    {helpOpen && <ExamHelpDialog onClose={() => setHelpOpen(false)} />}
    {consentOpen && <div className="exam-dialog-backdrop" role="presentation"><section className="exam-dialog" role="dialog" aria-modal="true" aria-label="GPT 전송 동의"><p>{onAskGpt ? "현재 문제, 내 답, 풀이 메모를 전송합니다." : "현재 문제는 로컬 MCP 브리지에만 공개됩니다."}</p>{onAskGpt && <button type="button" onClick={() => { onAskGpt({ question: question.question, response: response?.response ?? "", scratchNote: response?.scratchNote ?? "" }); setConsentOpen(false); }}>전송</button>}<button type="button" onClick={() => setConsentOpen(false)}>닫기</button></section></div>}
    {submitOpen && <div className="exam-dialog-backdrop" role="presentation"><section className="exam-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-submit-title"><h3 id="exam-submit-title">시험을 제출할까요?</h3><p>전체 {session.questions.length}문항 · 응답 {session.questions.length - unanswered.length}문항 · 미응답 {unanswered.length}문항 · 검토 표시 {marked.length}문항</p>{warnUnanswered && unanswered.length > 0 && <p>미응답: {unanswered.join(", ")}번</p>}{submitError && <p className="form-error" role="alert">{submitError}</p>}<footer><button type="button" onClick={() => setSubmitOpen(false)} disabled={submitting}>계속 풀기</button><button type="button" onClick={() => void submit()} disabled={submitting}>{submitting ? "제출 중…" : "제출하고 채점"}</button></footer></section></div>}
  </section>;
}
