import type { SheetAnswerItem, WrongAnswerEntry } from "../../../types";
import { LinkifiedText } from "../../../utils/wikiLinks";
import { buildConceptLinkContext } from "../../learning/utils/conceptIndex";
import { useEntryDetailContext } from "./EntryDetailContext";

interface FocusedNotesPanelProps {
  entry?: WrongAnswerEntry;
  focusedAnswer?: SheetAnswerItem;
  hasNotes: boolean;
  existingTargets: Set<string>;
  onWikiLinkClick(target: string): void;
}

export default function FocusedNotesPanel({
  entry,
  focusedAnswer,
  hasNotes,
  existingTargets,
  onWikiLinkClick,
}: FocusedNotesPanelProps) {
  const context = useEntryDetailContext();
  const resolvedEntry = entry ?? context.entry;
  if (!hasNotes) {
    return <div className="focused-empty-panel">현재 문제에 표시할 필기가 없습니다.</div>;
  }

  return (
    <div className="focused-notes-panel">
      {resolvedEntry.memo.trim() && (
        <section className="sheet-study-note-card sheet-study-note-card--global">
          <strong>전체 메모</strong>
          <div className="memo-content">
            <LinkifiedText
              text={resolvedEntry.memo}
              onLinkClick={onWikiLinkClick}
              existingTargets={existingTargets}
              conceptContext={buildConceptLinkContext(resolvedEntry)}
            />
          </div>
        </section>
      )}
      {focusedAnswer && (
        <article className="sheet-study-note-card">
          <strong>현재 문제 메모 {focusedAnswer.questionNumber ? `(${focusedAnswer.questionNumber}번)` : ""}</strong>
          {focusedAnswer.needsReview && <span className="answer-review-badge">번호 확인 필요</span>}
          {focusedAnswer.notes?.trim() && <p>{focusedAnswer.notes}</p>}
          {focusedAnswer.sourceNote?.trim() && <p>{focusedAnswer.sourceNote}</p>}
          {focusedAnswer.importantPoints.length > 0 && (
            <ul>
              {focusedAnswer.importantPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
        </article>
      )}
    </div>
  );
}
