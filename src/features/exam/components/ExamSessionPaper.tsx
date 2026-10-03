import { useEffect, useMemo, useRef, useState } from "react";
import type { ExamPreferences, ExamSession } from "../../../types";
import StudyZoomViewport, { getQuestionZoomStorageKey } from "../../../components/StudyZoomViewport";
import ExamPaperCompositor from "../../../components/ExamPaperCompositor";
import QuestionContentView from "../../../components/QuestionContentView";
import ExamResponseEditor from "./ExamResponseEditor";
import { sanitizeExamQuestionDomId } from "../services/examDom";
import QuestionFocusPage from "../../../components/QuestionFocusPage";
import OriginalPageExamReader from "./OriginalPageExamReader";
import "./ExamSessionPaper.css";

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
  onSessionChange?(recipe: (session: ExamSession) => ExamSession): void;
}

const EMPTY_SOURCE_PAGE_SELECTION: string[] = [];

function getQuestionSourcePages(session: ExamSession, question: ExamSession["questions"][number] | undefined, sourcePageImages: string[]): string[] {
  if (!question) return [];
  const mappedPages = Object.entries(session.sourcePageQuestionMap ?? {})
    .filter(([, numbers]) => numbers.includes(question.questionNumber))
    .map(([filename]) => filename);
  if (mappedPages.length) return mappedPages;
  if (!question.source?.page) return [];
  const questionPage = question.sourcePageImages?.[question.source.page - 1];
  if (questionPage) return [questionPage];
  if (session.sourcePageQuestionMap !== undefined || session.entryId.startsWith("generated:")) return [];
  const legacyPage = sourcePageImages[question.source.page - 1];
  return legacyPage ? [legacyPage] : [];
}

export default function ExamSessionPaper({ session, preferences, disabled, practice = false, onNavigate, onResponse, onSessionChange }: Props) {
  const measurementKey = useMemo(() => session.questions.map(question => JSON.stringify({ id: question.id, number: question.questionNumber, question: question.question, passage: question.passage, type: question.questionType, choices: question.choices, contentSegments: question.contentSegments, figures: question.figures, points: question.points })).join("|"), [session.questions]);
  const focusPresentation = preferences?.paperPresentation === "two-question";
  const [textViewState, setTextViewState] = useState(() => {
    if (session.mode !== "real") return { sessionId: session.id, textView: false };
    const question = session.questions[session.currentQuestionIndex];
    const linkedPages = getQuestionSourcePages(session, question, session.sourcePageImages ?? []);
    const textView = session.selectedSourcePageImages === undefined || !linkedPages.some(filename => session.selectedSourcePageImages?.includes(filename));
    return { sessionId: session.id, textView };
  });
  const textView = textViewState.sessionId === session.id ? textViewState.textView : (() => {
    if (session.mode !== "real") return false;
    const question = session.questions[session.currentQuestionIndex];
    const linkedPages = getQuestionSourcePages(session, question, session.sourcePageImages ?? []);
    return session.selectedSourcePageImages === undefined || !linkedPages.some(filename => session.selectedSourcePageImages?.includes(filename));
  })();
  const setTextView = (value: boolean) => setTextViewState({ sessionId: session.id, textView: value });
  const [practiceAnswerOpen, setPracticeAnswerOpen] = useState(true);
  const sourcePageImages = useMemo(() => session.sourcePageImages?.length
    ? session.sourcePageImages
    : [...new Set(session.questions.flatMap(question => question.sourcePageImages ?? []))], [session.questions, session.sourcePageImages]);
  const selectedPages = useMemo(
    () => session.selectedSourcePageImages ?? (session.mode === "real" ? EMPTY_SOURCE_PAGE_SELECTION : sourcePageImages),
    [session.mode, session.selectedSourcePageImages, sourcePageImages],
  );
  const currentQuestion = session.questions[session.currentQuestionIndex];
  const currentQuestionPages = getQuestionSourcePages(session, currentQuestion, sourcePageImages);
  const selectedCurrentQuestionPages = currentQuestionPages.filter(filename => selectedPages.includes(filename));
  const mappedCurrentPage = selectedCurrentQuestionPages[0] ?? currentQuestionPages[0];
  const currentQuestionPage = selectedCurrentQuestionPages.includes(session.currentSourcePageImage ?? "")
    ? session.currentSourcePageImage
    : selectedCurrentQuestionPages[0];
  const previousQuestionNumber = useRef(currentQuestion?.questionNumber);

  useEffect(() => {
    if (previousQuestionNumber.current === currentQuestion?.questionNumber) return;
    previousQuestionNumber.current = currentQuestion?.questionNumber;
    if (!sourcePageImages.length || !mappedCurrentPage || !selectedPages.includes(mappedCurrentPage) || session.currentSourcePageImage === mappedCurrentPage) return;
    const frame = requestAnimationFrame(() => onSessionChange?.(latest => ({ ...latest, currentSourcePageImage: mappedCurrentPage })));
    return () => cancelAnimationFrame(frame);
  }, [currentQuestion?.questionNumber, mappedCurrentPage, onSessionChange, selectedPages, session.currentSourcePageImage, sourcePageImages.length]);

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
        {!focusPresentation && question.passage && firstInGroup && <section className="exam-passage"><QuestionContentView text={question.passage} figures={question.figures} /></section>}
        <QuestionContentView text={question.question} segments={question.contentSegments} figures={question.figures} />
        <ExamResponseEditor question={question} response={response} disabled={disabled} onChange={value => onResponse(question.questionNumber, { response: value })} />
        <label className="real-exam-review"><input type="checkbox" aria-label={`${question.questionNumber}번 검토 표시`} checked={response?.markedForReview ?? false} disabled={disabled} onChange={event => onResponse(question.questionNumber, { markedForReview: event.target.checked })} />검토 표시</label>
        {practice && preferences?.showScratchNote !== false && <details><summary>풀이 메모</summary><label className="exam-note-field">{question.questionNumber}번 풀이 메모<textarea value={response?.scratchNote ?? ""} disabled={disabled} onChange={event => onResponse(question.questionNumber, { scratchNote: event.target.value })} /></label></details>}
      </article>,
        stimulusNode: question.passage && firstInGroup ? <section className="exam-passage"><QuestionContentView text={question.passage} figures={question.figures} /></section> : undefined,
        stimulusIncluded: firstInGroup,
      };
    });
  }, [disabled, focusPresentation, onResponse, practice, preferences?.showScratchNote, session.questions, session.responses]);

  const originalPageMode = Boolean(sourcePageImages.length && preferences?.showOriginalPages !== false && !textView);
  const originalReader = <OriginalPageExamReader
    filenames={sourcePageImages}
    selectedFilenames={selectedPages}
    currentFilename={currentQuestionPages.length > 0 ? currentQuestionPage ?? "" : session.currentSourcePageImage ?? mappedCurrentPage}
    emptyMessage={currentQuestionPages.length > 0 ? "선택한 페이지 중 이 문항에 연결된 페이지가 없습니다. 문항 텍스트 보기로 계속 풀거나 페이지를 다시 선택하세요." : undefined}
    onSelectPages={filenames => {
      const replacement = currentQuestionPages.find(filename => filenames.includes(filename));
      if (!replacement) setTextView(true);
      onSessionChange?.(latest => ({
        ...latest,
        selectedSourcePageImages: filenames,
        currentSourcePageImage: currentQuestionPages.includes(latest.currentSourcePageImage ?? "")
          && filenames.includes(latest.currentSourcePageImage ?? "") ? latest.currentSourcePageImage : replacement,
      }));
    }}
    onChangePage={filename => {
      onSessionChange?.(latest => ({ ...latest, currentSourcePageImage: filename }));
      const linkedNumbers = session.sourcePageQuestionMap?.[filename] ?? [];
      const pageNumber = sourcePageImages.indexOf(filename) + 1;
      const questionIndex = session.questions.findIndex(question => linkedNumbers.includes(question.questionNumber)) >= 0
        ? session.questions.findIndex(question => linkedNumbers.includes(question.questionNumber))
        : session.sourcePageQuestionMap === undefined && !session.entryId.startsWith("generated:")
          ? session.questions.findIndex(question => question.source?.page === pageNumber)
          : -1;
      if (questionIndex >= 0 && questionIndex !== session.currentQuestionIndex) onNavigate(questionIndex);
    }}
  />;

  return <StudyZoomViewport storageKey={getQuestionZoomStorageKey(session.entryId, "paper")}>
    <div className={`${originalPageMode ? "exam-session-paper exam-session-paper--original" : "exam-session-paper"}${practice && !practiceAnswerOpen ? " exam-session-paper--answer-collapsed" : ""}`}>
      {sourcePageImages.length > 0 && preferences?.showOriginalPages !== false && <nav className="exam-source-view-switch" aria-label="문제 보기 방식"><div className="exam-source-view-switch__modes"><button type="button" aria-pressed={originalPageMode} onClick={() => setTextView(false)}>원본 문제지</button><button type="button" aria-pressed={!originalPageMode} onClick={() => setTextView(true)}>문항 텍스트</button></div>{practice && originalPageMode && <button type="button" className="exam-source-answer-toggle" aria-expanded={practiceAnswerOpen} onClick={() => setPracticeAnswerOpen(open => !open)}>{practiceAnswerOpen ? "답안 접기" : "답안 펼치기"}</button>}</nav>}
      {originalPageMode ? <div className={`exam-source-layout${practice ? " exam-source-layout--practice" : " exam-source-layout--real"}`}>{originalReader}{practice && practiceAnswerOpen && currentQuestion && <aside className="exam-source-answer-panel" aria-label="현재 문항 답안">
        <label className="exam-source-question-select">답을 입력할 문항<select value={currentQuestion.questionNumber} onChange={event => { const index = session.questions.findIndex(question => question.questionNumber === event.target.value); if (index >= 0) onNavigate(index); }}>
          {session.questions.map(question => <option key={question.id} value={question.questionNumber}>{question.questionNumber}번{question.points ? ` · ${question.points}점` : ""}</option>)}
        </select></label>
        <h3>{currentQuestion.questionNumber}번 답안</h3>
        {session.currentSourcePageImage && !session.sourcePageQuestionMap?.[session.currentSourcePageImage]?.length && currentQuestion.source?.page !== sourcePageImages.indexOf(session.currentSourcePageImage) + 1 && <p className="exam-source-mapping-note" role="status">이 페이지와 문항의 연결 정보가 없습니다. 답할 문항을 직접 선택해 주세요.</p>}
        <ExamResponseEditor question={currentQuestion} response={session.responses.find(response => response.questionNumber === currentQuestion.questionNumber)} disabled={disabled} onChange={value => onResponse(currentQuestion.questionNumber, { response: value })} />
        <label className="exam-source-review"><input type="checkbox" checked={session.responses.find(response => response.questionNumber === currentQuestion.questionNumber)?.markedForReview ?? false} disabled={disabled} onChange={event => onResponse(currentQuestion.questionNumber, { markedForReview: event.target.checked })} />검토 표시</label>
        {preferences?.showScratchNote !== false && <details className="exam-source-notes"><summary>풀이 메모</summary><label>{currentQuestion.questionNumber}번 풀이 메모<textarea value={session.responses.find(response => response.questionNumber === currentQuestion.questionNumber)?.scratchNote ?? ""} disabled={disabled} onChange={event => onResponse(currentQuestion.questionNumber, { scratchNote: event.target.value })} /></label></details>}
      </aside>}</div>
        : preferences?.paperPresentation === "two-question" ? <QuestionFocusPage items={items} title={session.title} subject={session.subject} minutes={session.timeLimitMinutes}
    currentQuestionNumber={session.questions[session.currentQuestionIndex]?.questionNumber}
      onNavigateQuestion={number => {
      const index = session.questions.findIndex(question => question.questionNumber === number);
      if (index >= 0 && index !== session.currentQuestionIndex) onNavigate(index);
    }} /> : <ExamPaperCompositor enabled items={items} title={session.title} subject={session.subject} minutes={session.timeLimitMinutes}
    navigation={preferences?.paperNavigation ?? "vertical-pages"}
    currentQuestionNumber={session.questions[session.currentQuestionIndex]?.questionNumber}
    measurementKey={measurementKey}
    onQuestionChange={number => {
      const index = session.questions.findIndex(question => question.questionNumber === number);
      if (index >= 0 && index !== session.currentQuestionIndex) onNavigate(index);
    }} />}
    </div>
  </StudyZoomViewport>;
}
