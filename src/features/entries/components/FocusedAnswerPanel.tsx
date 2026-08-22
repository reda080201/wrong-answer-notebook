import type { SheetAnswerItem, WrongAnswerEntry } from "../../../types";
import MathText from "../../../components/MathText";
import { LinkifiedText } from "../../../utils/wikiLinks";
import { buildConceptLinkContext } from "../../learning/utils/conceptIndex";
import { useEntryDetailContext } from "./EntryDetailContext";

interface FocusedAnswerPanelProps {
  entry?: WrongAnswerEntry;
  answer?: SheetAnswerItem;
  hideAnswers: boolean;
  existingTargets: Set<string>;
  onWikiLinkClick: (target: string) => void;
}

export default function FocusedAnswerPanel({
  entry,
  answer,
  hideAnswers,
  existingTargets,
  onWikiLinkClick,
}: FocusedAnswerPanelProps) {
  const context = useEntryDetailContext();
  const resolvedEntry = entry ?? context.entry;
  if (!answer) {
    return <div className="focused-empty-panel">현재 문제에 연결된 답안이 없습니다.</div>;
  }

  return (
    <article className="focused-answer-card">
      <header>
        <span className="focused-section-label">답지</span>
        <strong className={hideAnswers ? "answer-hidden" : ""}>
          {hideAnswers ? "•••" : <MathText text={answer.answer || "정답 없음"} />}
        </strong>
        {answer.needsReview && <span className="answer-review-badge">검토 필요</span>}
      </header>
      {answer.sourceNote?.trim() && <p className="sheet-answer-source">{answer.sourceNote}</p>}
      {!hideAnswers && answer.notes?.trim() && <p className="sheet-answer-source">문제별 메모: {answer.notes}</p>}
      {answer.explanation.trim() && (
        <div className={`focused-answer-explanation ${hideAnswers ? "answer-hidden" : ""}`}>
          {hideAnswers ? "답 가리기 모드입니다." : (
            <LinkifiedText
              text={answer.explanation}
              onLinkClick={onWikiLinkClick}
              existingTargets={existingTargets}
              conceptContext={buildConceptLinkContext(resolvedEntry, answer.questionNumber)}
            />
          )}
        </div>
      )}
      {!hideAnswers && answer.importantPoints.length > 0 && (
        <ul className="sheet-answer-points">
          {answer.importantPoints.map((point) => <li key={point}>{point}</li>)}
        </ul>
      )}
    </article>
  );
}
