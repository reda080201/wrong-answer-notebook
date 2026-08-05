import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReviewItem, ReviewResult, SheetAnswerItem, WrongAnswerEntry } from "../types";
import { getEntryTitle, hasExplanationContent } from "../utils/entry";
import ContentBlock from "./ContentBlock";
import { LinkifiedText } from "../utils/wikiLinks";
import { parseQuestionText, type QuestionBlock } from "../utils/textLayout";
import { getQuestionMetaForBlock, normalizeQuestionNumber } from "../utils/questionMeta";
import { difficultyScoreLabel, resolveQuestionDifficultyScore } from "../utils/difficulty";
import { mistakeCauseLabel } from "../utils/mistakeAnalysis";
import MathText from "./MathText";
import { buildConceptLinkContext } from "../features/learning/utils/conceptIndex";

interface ReviewPanelProps {
  title: string;
  entries?: WrongAnswerEntry[];
  items?: ReviewItem[];
  onClose: () => void;
  onReview: (item: ReviewItem, result: ReviewResult) => Promise<void>;
  onOpenEntry: (entry: WrongAnswerEntry) => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}

const resultLabels: Record<ReviewResult, string> = {
  again: "다시",
  hard: "어려움",
  good: "맞음",
};

export default function ReviewPanel({
  title,
  entries,
  items,
  onClose,
  onReview,
  onOpenEntry,
  onWikiLinkClick,
  existingTargets,
}: ReviewPanelProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reviewStats, setReviewStats] = useState({ again: 0, hard: 0, good: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const savingRef = useRef(false);
  const reviewItems = useMemo<ReviewItem[]>(
    () => items ?? (entries ?? []).map((entry) => ({ kind: "entry", entry })),
    [entries, items],
  );
  useEffect(() => {
    setIndex(0);
    setRevealed(false);
    setReviewStats({ again: 0, hard: 0, good: 0 });
  }, [reviewItems]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  const requestClose = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);

  useEffect(() => {
    mountedRef.current = true;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      mountedRef.current = false;
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [requestClose]);
  const current = reviewItems[index] ?? null;
  const progress = useMemo(
    () => (reviewItems.length > 0 ? `${Math.min(index + 1, reviewItems.length)} / ${reviewItems.length}` : "0 / 0"),
    [reviewItems.length, index],
  );

  const handleReview = async (result: ReviewResult) => {
    if (!current || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onReview(current, result);
      if (!mountedRef.current) return;
      setReviewStats((stats) => ({ ...stats, [result]: stats[result] + 1 }));
      setRevealed(false);
      setIndex((value) => Math.min(value + 1, reviewItems.length));
    } catch (error) {
      if (mountedRef.current) {
        setSaveError(error instanceof Error && error.message ? error.message : "복습 결과를 저장하지 못했습니다.");
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  const currentEntry = current?.entry;
  const sheetQuestion =
    current?.kind === "sheet-question"
      ? resolveSheetQuestion(current.entry, current.questionNumber)
      : null;
  return (
    <div ref={panelRef} className="review-panel" role="dialog" aria-modal="true" aria-label={title} aria-busy={saving} tabIndex={-1}>
      <div className="review-panel-header">
        <div>
          <h2>{title}</h2>
          <span>{progress}</span>
        </div>
        <button type="button" className="btn-icon" onClick={requestClose} disabled={saving}>
          닫기
        </button>
      </div>
      {saveError && <p className="form-error" role="alert">{saveError}</p>}

      {!current || !currentEntry ? (
        reviewItems.length > 0 && (reviewStats.again + reviewStats.hard + reviewStats.good) > 0 ? (
          <section className="review-complete" aria-label="복습 완료 요약">
            <h3>복습을 마쳤습니다</h3>
            <p>이번 복습 결과를 확인하세요.</p>
            <dl className="review-complete-stats">
              <div><dt>다시</dt><dd>{reviewStats.again}</dd></div>
              <div><dt>어려움</dt><dd>{reviewStats.hard}</dd></div>
              <div><dt>맞음</dt><dd>{reviewStats.good}</dd></div>
            </dl>
            <button type="button" className="btn-primary" onClick={requestClose} disabled={saving}>복습 닫기</button>
          </section>
        ) : (
          <div className="review-empty">복습할 항목이 없습니다.</div>
        )
      ) : (
        <div className="review-card">
          <div className="review-card-top">
            <span className="subject-badge">{currentEntry.subject}</span>
            {current.kind === "sheet-question" && <span className="entry-mini-badge">문제 {current.questionNumber}</span>}
            <button type="button" className="btn-secondary btn-sm" onClick={() => onOpenEntry(currentEntry)}>
              원문 열기
            </button>
          </div>
          <h3>{current.kind === "sheet-question" ? `${getEntryTitle(currentEntry)} · 문제 ${current.questionNumber}` : getEntryTitle(currentEntry)}</h3>
          {current.kind === "sheet-question" && sheetQuestion ? (
            <SheetQuestionReviewCard
              block={sheetQuestion.block}
              answer={sheetQuestion.answer}
              entry={currentEntry}
              onWikiLinkClick={onWikiLinkClick}
              existingTargets={existingTargets}
            />
          ) : (
            <div className="review-question">
              <LinkifiedText
                text={currentEntry.question}
                onLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
                conceptContext={buildConceptLinkContext(currentEntry)}
              />
            </div>
          )}

          {!revealed ? (
            <button type="button" className="btn-primary review-reveal" onClick={() => setRevealed(true)}>
              정답 보기
            </button>
          ) : (
            <div className="review-answer">
              {current.kind === "sheet-question" && sheetQuestion ? (
                <SheetQuestionAnswer
                  answer={sheetQuestion.answer}
                  entry={currentEntry}
                  onWikiLinkClick={onWikiLinkClick}
                  existingTargets={existingTargets}
                />
              ) : currentEntry.correctAnswer.trim() && (
                <div>
                  <label>정답</label>
                  <p>
                    <LinkifiedText
                      text={currentEntry.correctAnswer}
                      onLinkClick={onWikiLinkClick}
                      existingTargets={existingTargets}
                      conceptContext={buildConceptLinkContext(currentEntry)}
                    />
                  </p>
                </div>
              )}
              {current.kind === "entry" && hasExplanationContent(currentEntry) && (
                <div>
                  <label>해설</label>
                  {currentEntry.explanationParts.map((part) => (
                    <ContentBlock
                      key={part.id}
                      text={part.text}
                      images={part.images}
                      variant="fill"
                      onWikiLinkClick={onWikiLinkClick}
                      existingTargets={existingTargets}
                      conceptContext={buildConceptLinkContext(currentEntry)}
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

function resolveSheetQuestion(entry: WrongAnswerEntry, questionNumber: string) {
  const normalized = normalizeQuestionNumber(questionNumber);
  const block = parseQuestionText(entry.question)
    .filter((item): item is QuestionBlock => item.kind === "question")
    .find(
      (item) =>
        normalizeQuestionNumber(item.displayNumber) === normalized ||
        normalizeQuestionNumber(item.numberLabel) === normalized,
    );
  if (!block) return null;
  const answer = (entry.answerKey ?? []).find(
    (item) =>
      normalizeQuestionNumber(item.questionNumber) === normalized ||
      normalizeQuestionNumber(item.questionNumber) === normalizeQuestionNumber(block.numberLabel),
  );
  return { block, answer };
}

function SheetQuestionReviewCard({
  block,
  answer,
  entry,
  onWikiLinkClick,
  existingTargets,
}: {
  block: QuestionBlock;
  answer?: SheetAnswerItem;
  entry: WrongAnswerEntry;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}) {
  const score = resolveQuestionDifficultyScore(entry.questionMeta, entry.answerKey, block);
  const meta = getQuestionMetaForBlock(entry, block);
  return (
    <div className="review-question">
      <div className="review-card-top">
        {score ? <span className="difficulty-score-pill">{difficultyScoreLabel(score)}</span> : null}
        {meta?.important ? <span className="entry-mini-badge entry-mini-badge--difficulty-high">중요</span> : null}
        {meta?.review?.stabilityDays ? (
          <span className="entry-mini-badge">안정도 {Math.round(meta.review.stabilityDays)}일</span>
        ) : null}
      </div>
      {meta?.mistakeAnalysis?.causes.length ? (
        <p className="review-question-meta">
          오답 원인: {meta.mistakeAnalysis.causes.map((cause) => mistakeCauseLabel(cause.type)).join(", ")}
        </p>
      ) : null}
      <LinkifiedText text={block.body} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} conceptContext={buildConceptLinkContext(entry, block.numberLabel)} />
      {block.choices.length > 0 && (
        <ol className="review-choice-list">
          {block.choices.map((choice) => (
            <li key={`${choice.marker}-${choice.text}`}>
              <strong>{choice.marker}</strong> <MathText text={choice.text} />
            </li>
          ))}
        </ol>
      )}
      {answer?.needsReview && <small className="answer-review-badge">답안 연결 검토 필요</small>}
    </div>
  );
}

function SheetQuestionAnswer({
  answer,
  entry,
  onWikiLinkClick,
  existingTargets,
}: {
  answer?: SheetAnswerItem;
  entry: WrongAnswerEntry;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}) {
  if (!answer) return <p>연결된 답안지가 없습니다.</p>;
  return (
    <>
      <div>
        <label>정답</label>
        <p><MathText text={answer.answer || "정답 없음"} /></p>
      </div>
      {[answer.strategy, answer.explanation, answer.wrongPoint, answer.reviewPoint, answer.notes, entry.memo]
        .filter((text): text is string => Boolean(text?.trim()))
        .map((text, index) => (
          <div key={`${index}-${text.slice(0, 12)}`}>
            <label>{index === 0 && answer.strategy ? "풀이 전략" : "해설/메모"}</label>
            <LinkifiedText text={text} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} conceptContext={buildConceptLinkContext(entry, answer.questionNumber)} />
          </div>
        ))}
    </>
  );
}
