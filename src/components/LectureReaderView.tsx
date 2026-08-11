import { useState } from "react";
import type { LectureLayout, SheetFigureItem, WrongAnswerEntry } from "../types";
import { resolveFigureRepresentation } from "../features/figures/services/figureRepresentation";
import SemanticFigureView from "../features/figures/components/SemanticFigureView";
import DiagramCard from "./DiagramCard";
import ImageGallery from "./ImageGallery";
import LearningContentPanel from "./LearningContentPanel";
import MathText from "./MathText";
import FullscreenDialog from "../shared/ui/FullscreenDialog";

interface LectureReaderViewProps {
  entry: WrongAnswerEntry;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  onOpenLinkedEntry?: (entryId: string) => void;
  layout?: LectureLayout;
  onLayoutChange?: (layout: LectureLayout) => void;
}

interface LectureReaderContentProps extends LectureReaderViewProps {
  showFullscreen?: boolean;
  onRequestFullscreen?: () => void;
}

function blockLabel(type: string): string {
  if (type === "concept") return "핵심 개념";
  if (type === "formula") return "공식";
  if (type === "routine") return "루틴";
  if (type === "warning") return "주의";
  if (type === "review") return "복습";
  if (type === "diagram") return "시각화";
  return "학습";
}

function FigureContent({ figure }: { figure: SheetFigureItem }) {
  const representation = resolveFigureRepresentation(figure);
  if (representation.kind === "semantic_render" && figure.semanticSpec) {
    return <figure className="lecture-figure"><figcaption>{figure.title || "구조 도형"}</figcaption><SemanticFigureView spec={figure.semanticSpec} title={figure.title} /></figure>;
  }
  if (representation.kind === "described_only" || !representation.image) {
    return <aside className="question-described-figure"><strong>도표 설명</strong><p>{figure.caption || figure.title || "이미지 없이 설명만 제공됩니다."}</p></aside>;
  }
  return (
    <figure className="lecture-figure">
      <figcaption>{figure.title || "연결 도형"}{figure.caption ? ` · ${figure.caption}` : ""}</figcaption>
      <ImageGallery filenames={[representation.image]} variant="fill" />
    </figure>
  );
}

function LectureReaderContent({
  entry,
  onWikiLinkClick,
  existingTargets,
  onOpenLinkedEntry,
  layout = "document",
  onLayoutChange,
  showFullscreen = true,
  onRequestFullscreen,
}: LectureReaderContentProps) {
  const blocks = entry.learningBlocks ?? [];
  const figures = entry.figures ?? [];
  const connectedFigureIds = new Set(blocks.flatMap((block) => block.figureIds ?? []));
  const unlinkedFigures = figures.filter((figure) => !connectedFigureIds.has(figure.id));
  const overview = entry.question.trim();
  const memo = entry.memo.trim();

  return (
    <article className={`lecture-reader lecture-reader--${layout}`}>
      <header className="lecture-reader-cover">
        <div className="lecture-reader-toolbar">
          <span className="modal-eyebrow">Lecture Library</span>
          <div className="lecture-layout-toggle" role="group" aria-label="특강 보기 방식">
            <button type="button" className={layout === "document" ? "active" : ""} onClick={() => onLayoutChange?.("document")}>문서형</button>
            <button type="button" className={layout === "cards" ? "active" : ""} onClick={() => onLayoutChange?.("cards")}>카드형</button>
          </div>
          {showFullscreen && <button type="button" onClick={onRequestFullscreen} aria-label="특강 전체 화면">전체 화면</button>}
        </div>
        <h2>{entry.title.trim() || "특강자료"}</h2>
        <p>{entry.subject}{entry.sourceType ? ` · ${entry.sourceType.toUpperCase()}에서 변환` : ""}</p>
      </header>

      {overview && (
        <section className="lecture-overview" id="lecture-overview">
          <h3>특강 개요</h3>
          <MathText text={overview} />
        </section>
      )}
      {memo && (
        <section className="lecture-support-section" id="lecture-memo">
          <h3>복습 메모</h3>
          <MathText text={memo} />
        </section>
      )}

      {blocks.length > 0 && (
        <nav className="lecture-toc" aria-label="특강 목차">
          <strong>목차</strong>
          <ol>{blocks.map((block, index) => <li key={block.id}><a href={`#lecture-block-${block.id}`}>{index + 1}. {block.title || blockLabel(block.type)}</a></li>)}</ol>
        </nav>
      )}

      {blocks.length > 0 ? (
        <div className="lecture-reader-grid">
          {blocks.map((block, index) => {
            const connectedFigures = figures.filter((figure) => (block.figureIds ?? []).includes(figure.id));
            return (
              <details key={block.id} id={`lecture-block-${block.id}`} className={`lecture-block lecture-block--${block.type}`} open>
                <summary>
                  <span className="formula-chip">{blockLabel(block.type)}</span>
                  {block.sourceQuestionNumber && <span className="formula-chip">{block.sourceQuestionNumber}번</span>}
                  <h3>{index + 1}. {block.title || "학습 내용"}</h3>
                </summary>
                {block.content.trim() && <MathText text={block.content} />}
                {block.images?.length ? <ImageGallery filenames={block.images} variant="fill" /> : null}
                {connectedFigures.map((figure) => <FigureContent key={figure.id} figure={figure} />)}
                <DiagramCard diagramType={block.diagramType} diagramSpec={block.diagramSpec} />
              </details>
            );
          })}
        </div>
      ) : (
        <LearningContentPanel entry={entry} variant="main" onWikiLinkClick={onWikiLinkClick} existingTargets={existingTargets} />
      )}

      {(entry.concepts?.length ?? 0) > 0 && <section className="lecture-support-section"><h3>핵심 개념</h3><p>{entry.concepts?.join(" · ")}</p></section>}
      {(entry.checklist?.length ?? 0) > 0 && <section className="lecture-support-section"><h3>체크리스트</h3><ul>{entry.checklist?.map((item) => <li key={item.id}>{item.text}</li>)}</ul></section>}
      {(entry.questionImages?.length || entry.sourcePageImages?.length) ? (
        <section className="lecture-support-section" id="lecture-source-pages">
          <h3>원본 자료</h3>
          <ImageGallery filenames={[...new Set([...(entry.sourcePageImages ?? []), ...entry.questionImages])]} variant="fill" />
        </section>
      ) : null}
      {unlinkedFigures.length > 0 && <section className="lecture-support-section"><h3>추가 도형</h3>{unlinkedFigures.map((figure) => <FigureContent key={figure.id} figure={figure} />)}</section>}

      {(entry.linkedEntryIds?.length ?? 0) > 0 && (
        <section className="lecture-linked">
          <h3>연결 문제</h3>
          <div className="lecture-linked-actions">
            {entry.linkedEntryIds?.map((id) => <button key={id} type="button" onClick={() => onOpenLinkedEntry?.(id)}>연결 문제 보기</button>)}
          </div>
        </section>
      )}
    </article>
  );
}

export default function LectureReaderView(props: LectureReaderViewProps) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const title = props.entry.title.trim() || "특강자료";

  return (
    <>
      <LectureReaderContent {...props} onRequestFullscreen={() => setFullscreenOpen(true)} />
      <FullscreenDialog
        open={fullscreenOpen}
        title={`${title} 전체 화면`}
        onClose={() => setFullscreenOpen(false)}
      >
        <div className="lecture-reader-fullscreen-content">
          <LectureReaderContent {...props} showFullscreen={false} />
        </div>
      </FullscreenDialog>
    </>
  );
}
