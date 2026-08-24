import type { Annotation, AnnotationTool, WrongAnswerEntry } from "../types";
import { parseQuestionText } from "../utils/textLayout";
import { getEntryQuestions } from "../utils/entryQuestions";
import { normalizeQuestionNumber, normalizeQuestionMeta } from "../utils/questionMeta";
import type { SuspiciousTextSegment } from "../utils/suspiciousText";
import AnnotatableQuestion from "./AnnotatableQuestion";
import DiagramCard from "./DiagramCard";
import ZoomableImageViewer from "./ZoomableImageViewer";
import StructuredQuestionRenderer from "../features/entries/components/StructuredQuestionRenderer";
import ExamPaperCompositor, { type ExamPaperLayout } from "./ExamPaperCompositor";
import { Maximize2 } from "lucide-react";
import "./StudyPaperView.css";

interface StudyPaperViewProps {
  entry: WrongAnswerEntry;
  memoMode: boolean;
  activeTool: AnnotationTool | "erase";
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  sheetLayout: ExamPaperLayout;
  searchQuery?: string;
  suspiciousSegments?: SuspiciousTextSegment[];
  onOpenQuestionTheater?: (questionIndex: number) => void;
  onToggleQuestionImportant?: (questionNumber: string) => void;
  onQuestionDifficultyScoreChange?: (questionNumber: string, score: number | undefined) => void;
  selectionMode?: boolean;
  selectedQuestionNumbers?: string[];
  onToggleQuestionSelected?: (questionNumber: string) => void;
  displayMode?: "questions" | "exam";
  revealedAnswerNumbers?: Set<string>;
  onToggleAnswerReveal?: (questionNumber: string) => void;
  onOpenQuestionSolution?: (questionNumber: string) => void;
}

export default function StudyPaperView({
  entry,
  memoMode,
  activeTool,
  onAnnotationsChange,
  onWikiLinkClick,
  existingTargets,
  sheetLayout,
  searchQuery,
  suspiciousSegments = [],
  onOpenQuestionTheater,
  onToggleQuestionImportant,
  onQuestionDifficultyScoreChange,
  selectionMode = false,
  selectedQuestionNumbers = [],
  onToggleQuestionSelected,
  displayMode = "questions",
  revealedAnswerNumbers,
  onToggleAnswerReveal,
  onOpenQuestionSolution,
}: StudyPaperViewProps) {
  const structuredQuestions = entry.structuredQuestions?.length ? getEntryQuestions(entry) : [];
  const blocks = structuredQuestions.length ? [] : parseQuestionText(entry.question);
  const questionCount = structuredQuestions.length || blocks.filter((block) => block.kind === "question").length;
  const figureImages = (entry.figures ?? []).flatMap((figure) => (figure.image ? [figure.image] : []));
  const diagramItems = [
    ...(entry.answerKey ?? [])
      .filter((item) => item.diagramSpec || item.diagramType)
      .map((item) => ({
        id: `answer-${item.id}`,
        label: item.questionNumber.trim() ? `${item.questionNumber.trim()}번 시각화` : "문항 시각화",
        diagramType: item.diagramType,
        diagramSpec: item.diagramSpec,
      })),
    ...(entry.learningBlocks ?? [])
      .filter((block) => block.diagramSpec || block.diagramType)
      .map((block) => ({
        id: `block-${block.id}`,
        label: block.title || "학습 시각화",
        diagramType: block.diagramType,
        diagramSpec: block.diagramSpec,
      })),
  ];

  return (
    <div className={`study-paper study-paper--${displayMode}`}>
      <div className="study-paper-sheet">
        <header className="study-paper-cover">
          <div>
            <span className="study-paper-label">문제지</span>
            <h3>{entry.title.trim() || "문제"}</h3>
          </div>
          <dl>
            <div>
              <dt>문항</dt>
              <dd>{questionCount || 1}</dd>
            </div>
            <div>
              <dt>삽화</dt>
              <dd>{(entry.figures ?? []).length}</dd>
            </div>
          </dl>
        </header>

        {structuredQuestions.length > 0 ? (
          <div className="structured-problem-sheet" data-source="structuredQuestions">
            <ExamPaperCompositor enabled={displayMode === "exam"}>
            {structuredQuestions.map((question, index) => {
              const number = normalizeQuestionNumber(question.questionNumber);
              const answer = (entry.answerKey ?? []).find((item) => normalizeQuestionNumber(item.questionNumber) === number);
              const meta = normalizeQuestionMeta(entry.questionMeta).find((item) => normalizeQuestionNumber(item.questionNumber) === number);
              const selected = selectedQuestionNumbers.some((item) => normalizeQuestionNumber(item) === number);
              const revealed = revealedAnswerNumbers?.has(number);
              return (
                <article key={number || question.position} id={`sheet-question-canonical-${number}`} className={`structured-problem-sheet-question structured-problem-sheet-question--${displayMode}`}>
                  <header>
                    <div>
                      <span className="question-identity">{question.questionNumber}번</span>
                      <small className="question-sequence">{question.position} / {questionCount}</small>
                      {question.points !== undefined && <small>{question.points}점</small>}
                      {question.needsReview && <small className="answer-review-badge">검토 필요</small>}
                    </div>
                    <div className="structured-problem-sheet-actions">
                      {selectionMode && <input aria-label={`${question.questionNumber}번 선택`} type="checkbox" checked={selected} onChange={() => onToggleQuestionSelected?.(number)} />}
                      {onOpenQuestionTheater && <button type="button" className="btn-icon" aria-label={`${question.questionNumber}번 크게 보기`} title="크게 보기" onClick={() => onOpenQuestionTheater(index)}><Maximize2 size={16} aria-hidden="true" /></button>}
                      {onToggleQuestionImportant && <button type="button" className="btn-secondary btn-sm" aria-pressed={Boolean(meta?.important)} onClick={() => onToggleQuestionImportant(number)}>{meta?.important ? "중요 해제" : "중요"}</button>}
                      {answer ? <button type="button" className="btn-secondary btn-sm" aria-expanded={revealed} onClick={() => onToggleAnswerReveal?.(number)}>답</button> : <button type="button" className="btn-secondary btn-sm" disabled title="연결된 정답이 없습니다.">답</button>}
                    </div>
                  </header>
                  <StructuredQuestionRenderer question={question} entry={entry} context={{ questionNumber: question.questionNumber, position: question.position }} />
                  {revealed && answer && <div className="structured-problem-sheet-answer"><strong>정답</strong> {answer.answer} {onOpenQuestionSolution && <button type="button" className="btn-secondary btn-sm" onClick={() => onOpenQuestionSolution(number)}>해설 보기</button>}</div>}
                  {question.warning && <p className="structured-problem-sheet-warning">{question.warning}</p>}
                </article>
              );
            })}
            </ExamPaperCompositor>
          </div>
        ) : <AnnotatableQuestion
          question={entry.question}
          questionImages={entry.questionImages}
          figures={entry.figures ?? []}
          annotations={entry.annotations ?? []}
          memoMode={memoMode}
          activeTool={activeTool}
          onAnnotationsChange={onAnnotationsChange}
          onWikiLinkClick={onWikiLinkClick}
          existingTargets={existingTargets}
          sheetLayout={sheetLayout === "auto" ? "single" : sheetLayout}
          searchQuery={searchQuery}
          suspiciousSegments={suspiciousSegments}
          sourceEntry={entry}
          onOpenQuestionTheater={onOpenQuestionTheater}
          questionMeta={entry.questionMeta ?? []}
          answerKey={entry.answerKey ?? []}
          onToggleQuestionImportant={onToggleQuestionImportant}
          onQuestionDifficultyScoreChange={onQuestionDifficultyScoreChange}
          selectionMode={selectionMode}
          selectedQuestionNumbers={selectedQuestionNumbers}
          onToggleQuestionSelected={onToggleQuestionSelected}
          presentation={displayMode}
          revealedAnswerNumbers={revealedAnswerNumbers}
          onToggleAnswerReveal={onToggleAnswerReveal}
          onOpenQuestionSolution={onOpenQuestionSolution}
          zoomableImages
        />}

        {displayMode === "questions" && diagramItems.length > 0 && (
          <details className="study-paper-diagrams" aria-label="학습 시각화">
            <summary className="study-paper-section-title">
              <span />
              <strong>GPT 학습용 시각화</strong>
              <span />
            </summary>
            <div className="study-paper-diagram-grid">
              {diagramItems.slice(0, 1).map((item) => (
                <div key={item.id} className="study-paper-diagram-item">
                  <span className="formula-chip">{item.label}</span>
                  <DiagramCard diagramType={item.diagramType} diagramSpec={item.diagramSpec} />
                </div>
              ))}
            </div>
          </details>
        )}

        {displayMode === "questions" && figureImages.length > 0 && (
          <section className="study-paper-figures" aria-label="문제 삽화 확대 보기">
            <div className="study-paper-section-title">
              <span />
              <strong>삽화 확대</strong>
              <span />
            </div>
            <ZoomableImageViewer filenames={[...new Set(figureImages)]} />
          </section>
        )}
      </div>
    </div>
  );
}
