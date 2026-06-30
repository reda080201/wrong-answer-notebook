import type { Annotation, AnnotationTool, WrongAnswerEntry } from "../types";
import { parseQuestionText } from "../utils/textLayout";
import AnnotatableQuestion from "./AnnotatableQuestion";
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
}: StudyPaperViewProps) {
  const blocks = parseQuestionText(entry.question);
  const questionCount = blocks.filter((block) => block.kind === "question").length;
  const figureImages = (entry.figures ?? []).flatMap((figure) => (figure.image ? [figure.image] : []));

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
          zoomableImages
        />

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
