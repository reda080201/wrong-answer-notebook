import { useMemo } from "react";
import type { ExamPreferences, ExamSession } from "../../../types";
import StudyZoomViewport, { getQuestionZoomStorageKey } from "../../../components/StudyZoomViewport";
import ExamPaperCompositor from "../../../components/ExamPaperCompositor";
import QuestionContentView from "../../../components/QuestionContentView";
import ZoomableImageViewer from "../../../components/ZoomableImageViewer";
import ExamResponseEditor from "./ExamResponseEditor";
import { sanitizeExamQuestionDomId } from "../services/examDom";
import QuestionFocusPage from "../../../components/QuestionFocusPage";

export interface PaperResponsePatch {
  response?: string;
  scratchNote?: string;
  markedForReview?: boolean;
}

interface Props {
  session: ExamSession;
  preferences?: ExamPreferences;
  disabled: boolean;
  practice?: boolean;
  onNavigate(index: number): void;
  onResponse(number: string, patch: PaperResponsePatch): void;
}

export default function ExamSessionPaper({ session, preferences, disabled, practice = false, onNavigate, onResponse }: Props) {
  const measurementKey = useMemo(() => session.questions.map(question => JSON.stringify({ id: question.id, number: question.questionNumber, question: question.question, passage: question.passage, type: question.questionType, choices: question.choices, contentSegments: question.contentSegments, figures: question.figures, points: question.points })).join("|"), [session.questions]);
  const items = useMemo(() => {
    const responses = new Map(session.responses.map(response => [response.questionNumber, response]));
    return session.questions.map((question, index) => {
    const response = responses.get(question.questionNumber);
    const firstInGroup = !question.stimulusGroupId || session.questions[index - 1]?.stimulusGroupId !== question.stimulusGroupId;
      return {
      id: question.id,
      questionNumber: question.questionNumber,
      groupId: question.stimulusGroupId,
      node: <article id={sanitizeExamQuestionDomId(question.questionNumber)} className="exam-question-paper" aria-label={`문제 ${question.questionNumber}`}>
        <header className="exam-question-heading"><strong>{question.questionNumber}.</strong>{typeof question.points === "number" && <span>[{question.points}점]</span>}</header>
        {(question.warning || question.sourceWarning) && <p className="exam-question-warning">{question.warning || question.sourceWarning}</p>}
        {question.passage && firstInGroup && <section className="exam-passage"><QuestionContentView text={question.passage} /></section>}
        <QuestionContentView text={question.question} segments={question.contentSegments} figures={question.figures} />
        <ExamResponseEditor question={question} response={response} disabled={disabled} onChange={value => onResponse(question.questionNumber, { response: value })} />
        <label className="real-exam-review"><input type="checkbox" aria-label={`${question.questionNumber}번 검토 표시`} checked={response?.markedForReview ?? false} disabled={disabled} onChange={event => onResponse(question.questionNumber, { markedForReview: event.target.checked })} />검토 표시</label>
        {practice && preferences?.showScratchNote !== false && <details><summary>풀이 메모</summary><label className="exam-note-field">{question.questionNumber}번 풀이 메모<textarea value={response?.scratchNote ?? ""} disabled={disabled} onChange={event => onResponse(question.questionNumber, { scratchNote: event.target.value })} /></label></details>}
        {practice && preferences?.showOriginalPages !== false && Boolean(question.sourcePageImages?.length) && <details><summary>원본 페이지 보기</summary><ZoomableImageViewer filenames={question.sourcePageImages ?? []} /></details>}
      </article>,
      };
    });
  }, [disabled, onResponse, practice, preferences?.showOriginalPages, preferences?.showScratchNote, session.questions, session.responses]);
  return <StudyZoomViewport storageKey={getQuestionZoomStorageKey(session.entryId, "paper")}>{preferences?.paperPresentation === "two-question" ? <QuestionFocusPage items={items} title={session.title} subject={session.subject} minutes={session.timeLimitMinutes}
    navigation={preferences?.paperNavigation ?? "vertical-pages"}
    currentQuestionNumber={session.questions[session.currentQuestionIndex]?.questionNumber}
    onQuestionChange={number => {
      const index = session.questions.findIndex(question => question.questionNumber === number);
      if (index >= 0 && index !== session.currentQuestionIndex) onNavigate(index);
    }} /> : <ExamPaperCompositor enabled items={items} title={session.title} subject={session.subject} minutes={session.timeLimitMinutes}
    navigation={preferences?.paperNavigation ?? "vertical-pages"}
    currentQuestionNumber={session.questions[session.currentQuestionIndex]?.questionNumber}
    measurementKey={measurementKey}
    onQuestionChange={number => {
      const index = session.questions.findIndex(question => question.questionNumber === number);
      if (index >= 0 && index !== session.currentQuestionIndex) onNavigate(index);
    }} />}</StudyZoomViewport>;
}
