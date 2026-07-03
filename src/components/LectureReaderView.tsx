import type { WrongAnswerEntry } from "../types";
import DiagramCard from "./DiagramCard";
import LearningContentPanel from "./LearningContentPanel";
import MathText from "./MathText";

interface LectureReaderViewProps {
  entry: WrongAnswerEntry;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  onOpenLinkedEntry?: (entryId: string) => void;
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

export default function LectureReaderView({
  entry,
  onWikiLinkClick,
  existingTargets,
  onOpenLinkedEntry,
}: LectureReaderViewProps) {
  const blocks = entry.learningBlocks ?? [];

  return (
    <article className="lecture-reader">
      <header className="lecture-reader-cover">
        <span className="modal-eyebrow">Lecture Library</span>
        <h2>{entry.title.trim() || "특강자료"}</h2>
        <p>
          {entry.subject}
          {entry.sourceType ? ` · ${entry.sourceType.toUpperCase()}에서 변환` : ""}
        </p>
      </header>

      {blocks.length > 0 ? (
        <div className="lecture-reader-grid">
          {blocks.map((block) => (
            <section key={block.id} className={`lecture-block lecture-block--${block.type}`}>
              <div className="lecture-block-head">
                <span className="formula-chip">{blockLabel(block.type)}</span>
                {block.sourceQuestionNumber && <span className="formula-chip">{block.sourceQuestionNumber}번</span>}
              </div>
              <h3>{block.title || "학습 내용"}</h3>
              {block.content.trim() && <MathText text={block.content} />}
              <DiagramCard diagramType={block.diagramType} diagramSpec={block.diagramSpec} />
            </section>
          ))}
        </div>
      ) : (
        <LearningContentPanel
          entry={entry}
          variant="main"
          onWikiLinkClick={onWikiLinkClick}
          existingTargets={existingTargets}
        />
      )}

      {(entry.linkedEntryIds?.length ?? 0) > 0 && (
        <section className="lecture-linked">
          <h3>연결 문제</h3>
          <div className="lecture-linked-actions">
            {entry.linkedEntryIds?.map((id) => (
              <button key={id} type="button" onClick={() => onOpenLinkedEntry?.(id)}>
                연결 문제 보기
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
