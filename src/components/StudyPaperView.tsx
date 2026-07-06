import type { Annotation, AnnotationTool, WrongAnswerEntry } from "../types";
import { parseQuestionText } from "../utils/textLayout";
import type { SuspiciousTextSegment } from "../utils/suspiciousText";
import AnnotatableQuestion from "./AnnotatableQuestion";
import DiagramCard from "./DiagramCard";
import ZoomableImageViewer from "./ZoomableImageViewer";

interface StudyPaperViewProps {
  entry: WrongAnswerEntry;
  memoMode: boolean;
  activeTool: AnnotationTool | "erase";
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  sheetLayout: "single" | "columns";
  searchQuery?: string;
  suspiciousSegments?: SuspiciousTextSegment[];
  onOpenQuestionTheater?: (questionIndex: number) => void;
  onToggleQuestionImportant?: (questionNumber: string) => void;
  onQuestionDifficultyScoreChange?: (questionNumber: string, score: number | undefined) => void;
  selectionMode?: boolean;
  selectedQuestionNumbers?: string[];
  onToggleQuestionSelected?: (questionNumber: string) => void;
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
}: StudyPaperViewProps) {
  const blocks = parseQuestionText(entry.question);
  const questionCount = blocks.filter((block) => block.kind === "question").length;
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
    <div className="study-paper">
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

        <AnnotatableQuestion
          question={entry.question}
          questionImages={entry.questionImages}
          figures={entry.figures ?? []}
          annotations={entry.annotations ?? []}
          memoMode={memoMode}
          activeTool={activeTool}
          onAnnotationsChange={onAnnotationsChange}
          onWikiLinkClick={onWikiLinkClick}
          existingTargets={existingTargets}
          sheetLayout={sheetLayout}
          searchQuery={searchQuery}
          suspiciousSegments={suspiciousSegments}
          onOpenQuestionTheater={onOpenQuestionTheater}
          questionMeta={entry.questionMeta ?? []}
          answerKey={entry.answerKey ?? []}
          onToggleQuestionImportant={onToggleQuestionImportant}
          onQuestionDifficultyScoreChange={onQuestionDifficultyScoreChange}
          selectionMode={selectionMode}
          selectedQuestionNumbers={selectedQuestionNumbers}
          onToggleQuestionSelected={onToggleQuestionSelected}
          zoomableImages
        />

        {diagramItems.length > 0 && (
          <section className="study-paper-diagrams" aria-label="문제 시각화">
            <div className="study-paper-section-title">
              <span />
              <strong>시각화</strong>
              <span />
            </div>
            <div className="study-paper-diagram-grid">
              {diagramItems.map((item) => (
                <div key={item.id} className="study-paper-diagram-item">
                  <span className="formula-chip">{item.label}</span>
                  <DiagramCard diagramType={item.diagramType} diagramSpec={item.diagramSpec} />
                </div>
              ))}
            </div>
          </section>
        )}

        {figureImages.length > 0 && (
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
