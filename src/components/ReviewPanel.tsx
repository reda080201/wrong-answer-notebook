import { useMemo, useState } from "react";
import type { ReviewResult, WrongAnswerEntry } from "../types";
import { getEntryTitle, hasExplanationContent } from "../utils/entry";
import ContentBlock from "./ContentBlock";
import { LinkifiedText } from "../utils/wikiLinks";

interface ReviewPanelProps {
  title: string;
  entries: WrongAnswerEntry[];
  onClose: () => void;
  onReview: (entry: WrongAnswerEntry, result: ReviewResult) => Promise<void>;
  onOpenEntry: (entry: WrongAnswerEntry) => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}

const resultLabels: Record<ReviewResult, string> = {
  again: "틀림",
  hard: "애매함",
  good: "맞힘",
};

export default function ReviewPanel({
  title,
  entries,
  onClose,
  onReview,
  onOpenEntry,
  onWikiLinkClick,
  existingTargets,
}: ReviewPanelProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = entries[index] ?? null;
  const progress = useMemo(
    () => (entries.length > 0 ? `${Math.min(index + 1, entries.length)} / ${entries.length}` : "0 / 0"),
    [entries.length, index],
  );

  const handleReview = async (result: ReviewResult) => {
    if (!current) return;
    setSaving(true);
    try {
      await onReview(current, result);
      setRevealed(false);
      setIndex((value) => Math.min(value + 1, entries.length));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="review-panel">
      <div className="review-panel-header">
        <div>
          <h2>{title}</h2>
          <span>{progress}</span>
        </div>
        <button type="button" className="btn-icon" onClick={onClose}>
          닫기
        </button>
      </div>

      {!current ? (
        <div className="review-empty">복습할 항목이 없습니다.</div>
      ) : (
        <div className="review-card">
          <div className="review-card-top">
            <span className="subject-badge">{current.subject}</span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => onOpenEntry(current)}>
              원문 열기
            </button>
          </div>
          <h3>{getEntryTitle(current)}</h3>
          <div className="review-question">
            <LinkifiedText
              text={current.question}
              onLinkClick={onWikiLinkClick}
              existingTargets={existingTargets}
            />
          </div>

          {!revealed ? (
            <button type="button" className="btn-primary review-reveal" onClick={() => setRevealed(true)}>
              정답 보기
            </button>
          ) : (
            <div className="review-answer">
              {current.correctAnswer.trim() && (
                <div>
                  <label>정답</label>
                  <p>
                    <LinkifiedText
                      text={current.correctAnswer}
                      onLinkClick={onWikiLinkClick}
                      existingTargets={existingTargets}
                    />
                  </p>
                </div>
              )}
              {hasExplanationContent(current) && (
                <div>
                  <label>해설</label>
                  {current.explanationParts.map((part) => (
                    <ContentBlock
                      key={part.id}
                      text={part.text}
                      images={part.images}
                      variant="fill"
                      onWikiLinkClick={onWikiLinkClick}
                      existingTargets={existingTargets}
                    />
                  ))}
                </div>
              )}
              <div className="review-actions">
                {(["again", "hard", "good"] as const).map((result) => (
                  <button
                    key={result}
                    type="button"
                    className={`review-result review-result--${result}`}
                    disabled={saving}
                    onClick={() => handleReview(result)}
                  >
                    {resultLabels[result]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
