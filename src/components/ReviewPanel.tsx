import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealExamProtection, assertRealExamSourcesAllowed } from "../features/exam/services/realExamProtection";
import { createPortal } from "react-dom";
import type { ReviewEvent, ReviewItem, ReviewResult, ReviewSession, ReviewSubmission, SheetAnswerItem, WrongAnswerEntry } from "../types";
import { getEntryTitle, hasExplanationContent } from "../utils/entry";
import ContentBlock from "./ContentBlock";
import { LinkifiedText } from "../utils/wikiLinks";
import type { QuestionBlock } from "../utils/textLayout";
import { getEntryQuestions, resolvedQuestionToBlock, type ResolvedEntryQuestion } from "../utils/entryQuestions";
import { resolveQuestionFigures } from "../utils/questionAssets";
import QuestionContentView from "./QuestionContentView";
import { getQuestionMetaForBlock, normalizeQuestionNumber } from "../utils/questionMeta";
import { difficultyScoreLabel, resolveQuestionDifficultyScore } from "../utils/difficulty";
import { mistakeCauseLabel } from "../utils/mistakeAnalysis";
import MathText from "./MathText";
import { buildConceptLinkContext } from "../features/learning/utils/conceptIndex";
import { isEditableCommandTarget, reviewCommands } from "../utils/reviewCommands";
import { reviewItemKey, reviewSessionFingerprint } from "../features/review/storage/reviewSessionIdentity";

interface ReviewPanelProps {
  title: string;
  mode?: ReviewSession["mode"];
  entries?: WrongAnswerEntry[];
  items?: ReviewItem[];
  onClose: () => void;
  onReview: (item: ReviewItem, submission: ReviewSubmission) => Promise<void>;
  onOpenEntry: (entry: WrongAnswerEntry) => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  session?: ReviewSession;
  onSessionSave?: (session: ReviewSession) => Promise<void>;
}

const resultLabels: Record<ReviewResult, string> = {
  again: "다시",
  hard: "어려움",
  good: "맞음",
};

const EMPTY_REVIEW_EVENTS: ReviewEvent[] = [];
const EMPTY_COMPLETED_KEYS: string[] = [];

interface PendingSessionCommit {
  session: ReviewSession;
  shouldAdvance: boolean;
}

export default function ReviewPanel({
  title,
  mode,
  entries,
  items,
  onClose,
  onReview,
  onOpenEntry,
  onWikiLinkClick,
  existingTargets,
  session,
  onSessionSave,
}: ReviewPanelProps) {
  const protection = useRealExamProtection();
  const [index, setIndex] = useState(session?.currentIndex ?? 0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reviewEvents, setReviewEvents] = useState<ReviewEvent[]>(session?.reviewEvents ?? []);
  const [completedKeys, setCompletedKeys] = useState<string[]>(session?.completedItemKeys ?? []);
  const [editingCompleted, setEditingCompleted] = useState(false);
  const [pendingSessionCommit, setPendingSessionCommit] = useState<PendingSessionCommit | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const savingRef = useRef(false);
  const revealedRef = useRef(false);
  const sessionIdRef = useRef(session?.id ?? `review-${crypto.randomUUID()}`);
  const sessionStartedAtRef = useRef(session?.createdAt ?? new Date().toISOString());
  const incomingSessionKey = session ? `${session.id}:${session.updatedAt}` : "new";
  const incomingSessionId = session?.id;
  const incomingSessionCreatedAt = session?.createdAt;
  const incomingSessionCurrentIndex = session?.currentIndex ?? 0;
  const incomingSessionReviewEvents = session?.reviewEvents ?? EMPTY_REVIEW_EVENTS;
  const incomingSessionCompletedKeys = session?.completedItemKeys ?? EMPTY_COMPLETED_KEYS;
  const incomingSessionState = useMemo(
    () => ({
      id: incomingSessionId,
      createdAt: incomingSessionCreatedAt,
      currentIndex: incomingSessionCurrentIndex,
      reviewEvents: incomingSessionReviewEvents,
      completedItemKeys: incomingSessionCompletedKeys,
    }),
    [incomingSessionCompletedKeys, incomingSessionCreatedAt, incomingSessionCurrentIndex, incomingSessionId, incomingSessionReviewEvents],
  );
  const reviewItems = useMemo<ReviewItem[]>(
    () => items ?? (entries ?? []).map((entry) => ({ kind: "entry", entry })),
    [entries, items],
  );
  const reviewStats = useMemo(() => {
    const counts = { again: 0, hard: 0, good: 0 };
    for (const event of reviewEvents) {
      if (event.result in counts) {
        counts[event.result as keyof typeof counts] += 1;
      }
    }
    return counts;
  }, [reviewEvents]);
  const sessionInitializedRef = useRef(false);
  useEffect(() => {
    sessionIdRef.current = incomingSessionState.id ?? sessionIdRef.current;
    sessionStartedAtRef.current = incomingSessionState.createdAt ?? sessionStartedAtRef.current;
    sessionInitializedRef.current = false;
    setIndex(incomingSessionState.currentIndex);
    setRevealed(false);
    setReviewEvents(incomingSessionState.reviewEvents);
    setCompletedKeys(incomingSessionState.completedItemKeys);
  }, [incomingSessionKey, incomingSessionState]);

  useEffect(() => {
    if (sessionInitializedRef.current || !onSessionSave || !reviewItems.length) return;
    sessionInitializedRef.current = true;
    void onSessionSave({
      id: sessionIdRef.current,
      mode: mode ?? "random",
      itemRefs: reviewItems.map((item) => item.kind === "sheet-question"
        ? { kind: item.kind, entryId: item.entry.id, questionNumber: normalizeQuestionNumber(item.questionNumber) }
        : { kind: item.kind, entryId: item.entry.id }),
      currentIndex: session?.currentIndex ?? 0,
      completedItemKeys: session?.completedItemKeys ?? [],
      reviewEvents: session?.reviewEvents ?? [],
      seedFingerprint: reviewSessionFingerprint(mode ?? "random", reviewItems),
      createdAt: sessionStartedAtRef.current,
      updatedAt: new Date().toISOString(),
    }).catch(() => {
      // A review panel must remain usable when an optional session store is unavailable.
      setSaveError("복습 결과는 저장할 수 있지만 세션 진행 상태를 보존하지 못했습니다.");
    });
  }, [mode, onSessionSave, reviewItems, session]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  const requestClose = useCallback(() => {
    if (!savingRef.current && !pendingSessionCommit) onClose();
  }, [onClose, pendingSessionCommit]);

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
  const currentItemKey = current ? reviewItemKey(current) : null;
  const completedEvent = useMemo(
    () => (current && currentItemKey ? reviewEvents.find((event) => event.itemKey === currentItemKey) : undefined),
    [current, currentItemKey, reviewEvents],
  );
  const progress = useMemo(
    () => (reviewItems.length > 0 ? `${Math.min(index + 1, reviewItems.length)} / ${reviewItems.length}` : "0 / 0"),
    [reviewItems.length, index],
  );

  const finishSessionCommit = useCallback((shouldAdvance: boolean) => {
    setPendingSessionCommit(null);
    setEditingCompleted(false);
    setRevealed(false);
    if (shouldAdvance) setIndex((value) => Math.min(value + 1, reviewItems.length));
  }, [reviewItems.length]);

  const retrySessionCommit = useCallback(async () => {
    const commit = pendingSessionCommit;
    if (!commit || !onSessionSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onSessionSave(commit.session);
      if (mountedRef.current) finishSessionCommit(commit.shouldAdvance);
    } catch (error) {
      if (mountedRef.current) setSaveError(error instanceof Error && error.message ? error.message : "세션 진행 상태를 저장하지 못했습니다.");
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [finishSessionCommit, onSessionSave, pendingSessionCommit]);

  const handleReview = useCallback(async (result: ReviewResult) => {
    if (!current || savingRef.current || pendingSessionCommit || (completedEvent && !editingCompleted)) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const eventId = completedEvent?.id ?? crypto.randomUUID();
      assertRealExamSourcesAllowed([current.entry.id]);
      const reviewedAt = completedEvent?.reviewedAt ?? new Date().toISOString();
      await onReview(current, {
        result,
        eventId,
        replacementEventId: completedEvent?.id,
        reviewedAt,
      });
      if (!mountedRef.current) return;
      const itemKey = reviewItemKey(current);
      const nextKeys = completedKeys.includes(itemKey) ? completedKeys : [...completedKeys, itemKey];
      setCompletedKeys(nextKeys);
      const nextEvent = {
        id: eventId,
        reviewedAt,
        result,
        nextDueAt: null,
        intervalDays: 0,
        itemKey,
      };
      const nextReviewEvents = completedEvent
        ? reviewEvents.map((event) => event.id === completedEvent.id ? nextEvent : event)
        : [...reviewEvents, nextEvent];
      setReviewEvents(nextReviewEvents);
      const shouldAdvance = !editingCompleted;
      if (onSessionSave) {
        const nextIndex = editingCompleted ? index : Math.min(index + 1, reviewItems.length);
        const updatedAt = new Date().toISOString();
        const nextSession: ReviewSession = {
          id: sessionIdRef.current,
          mode: mode ?? "random",
          itemRefs: reviewItems.map((item) => item.kind === "sheet-question"
            ? { kind: item.kind, entryId: item.entry.id, questionNumber: normalizeQuestionNumber(item.questionNumber) }
            : { kind: item.kind, entryId: item.entry.id }),
          currentIndex: nextIndex,
          completedItemKeys: nextKeys,
          reviewEvents: nextReviewEvents,
          seedFingerprint: reviewSessionFingerprint(mode ?? "random", reviewItems),
          createdAt: sessionStartedAtRef.current,
          updatedAt,
          ...(!editingCompleted && nextIndex >= reviewItems.length ? { completedAt: updatedAt } : {}),
        };
        const commit = { session: nextSession, shouldAdvance };
        setPendingSessionCommit(commit);
        try {
          await onSessionSave(nextSession);
        } catch (error) {
          if (mountedRef.current) setSaveError(error instanceof Error && error.message
            ? `복습 결과는 저장되었지만 진행 상태를 저장하지 못했습니다. ${error.message}`
            : "복습 결과는 저장되었지만 진행 상태를 저장하지 못했습니다.");
          return;
        }
        if (mountedRef.current) finishSessionCommit(commit.shouldAdvance);
        return;
      }
      finishSessionCommit(shouldAdvance);
    } catch (error) {
      if (mountedRef.current) {
        setSaveError(error instanceof Error && error.message ? error.message : "복습 결과를 저장하지 못했습니다.");
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [completedEvent, completedKeys, current, editingCompleted, finishSessionCommit, index, mode, onReview, onSessionSave, pendingSessionCommit, reviewEvents, reviewItems]);

  useEffect(() => {
    const onCommand = (event: KeyboardEvent) => {
      if (savingRef.current || event.metaKey || event.ctrlKey || event.altKey || isEditableCommandTarget(event.target)) return;
      if (event.key === " " || event.code === "Space") {
        if (!revealedRef.current && current) {
          event.preventDefault();
          setRevealed(true);
        }
        return;
      }
      const command = reviewCommands.find((candidate) => candidate.key === event.key);
      if (!command) return;
      if (command.result && revealedRef.current && current && (!completedEvent || editingCompleted)) {
        event.preventDefault();
        void handleReview(command.result);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setEditingCompleted(false);
        setIndex((value) => Math.max(0, value - 1));
        setRevealed(false);
      } else if (event.key === "ArrowRight" && index < reviewItems.length - 1) {
        event.preventDefault();
        setEditingCompleted(false);
        setIndex((value) => value + 1);
        setRevealed(false);
      }
    };
    document.addEventListener("keydown", onCommand);
    return () => document.removeEventListener("keydown", onCommand);
  }, [completedEvent, current, editingCompleted, index, reviewItems.length, handleReview]);

  const currentEntry = current?.entry;
  const sheetQuestion =
    current?.kind === "sheet-question"
      ? resolveSheetQuestion(current.entry, current.questionNumber)
      : null;
  return createPortal((
    <div ref={panelRef} className="review-panel" role="dialog" aria-modal="true" aria-label={title} aria-busy={saving} tabIndex={-1}>
      <div className="review-panel-header">
        <div>
          <h2>{title}</h2>
          <span>{progress}</span>
        </div>
        <dl className="review-stats" aria-label="복습 통계">
          <div><dt>다시</dt><dd>{reviewStats.again}</dd></div>
          <div><dt>어려움</dt><dd>{reviewStats.hard}</dd></div>
          <div><dt>맞음</dt><dd>{reviewStats.good}</dd></div>
        </dl>
        <button type="button" className="btn-icon" onClick={requestClose} disabled={saving || Boolean(pendingSessionCommit)}>
          닫기
        </button>
      </div>
      {saveError && (
        <div className="form-error" role="alert">
          <span>{saveError}</span>
          {pendingSessionCommit && onSessionSave && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => void retrySessionCommit()} disabled={saving}>
              세션 진행 상태 다시 저장
            </button>
          )}
        </div>
      )}

      {currentEntry && (protection.unavailable || protection.sourceIds.has(currentEntry.id)) ? <section role="status"><p>진행 중 실전 시험의 자료는 제출 후 복습할 수 있습니다. 시험을 닫아도 보호는 유지됩니다.</p><button type="button" onClick={requestClose}>복습 닫기</button></section> : !current || !currentEntry ? (
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
              question={sheetQuestion.question}
              answer={sheetQuestion.answer}
              entry={currentEntry}
              onWikiLinkClick={onWikiLinkClick}
              existingTargets={existingTargets}
            />
          ) : (
            <div className="review-question">
              {current.kind === "sheet-question" && !sheetQuestion && <p role="note">복습 문항을 유일하게 연결하지 못했습니다. 원문을 열어 문항 연결을 확인하세요.</p>}
              {(() => {
                const questions = current.kind === "entry" ? getEntryQuestions(currentEntry) : [];
                const candidates = currentEntry.generatedFromQuestionNumber
                  ? questions.filter((question) => normalizeQuestionNumber(question.questionNumber) === normalizeQuestionNumber(currentEntry.generatedFromQuestionNumber))
                  : questions;
                const question = candidates.length === 1 ? candidates[0] : undefined;
                return question?.contentSegments?.length ? <>{question.passage && <section className="exam-passage"><QuestionContentView text={question.passage.text} figures={resolveQuestionFigures(currentEntry, question)} appendUnreferencedFigures={false} /></section>}<QuestionContentView referencedPassage={question.passage?.text} text={question.questionText} segments={question.contentSegments} choices={question.choices} figures={resolveQuestionFigures(currentEntry, question)} appendUnreferencedFigures={false} /></> : <LinkifiedText

                text={currentEntry.question}
                onLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
                conceptContext={buildConceptLinkContext(currentEntry)}
              />;
              })()}
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
              {completedEvent && !editingCompleted && (
                <div className="review-completed-state" role="status">
                  <span>이 세션에서 {resultLabels[completedEvent.result]}으로 평가했습니다.</span>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingCompleted(true)} disabled={saving}>평가 수정</button>
                </div>
              )}
              <div className="review-actions" aria-label="복습 평가">
                {(["again", "hard", "good"] as const).map((result) => (
                  <button
                    key={result}
                    type="button"
                    className={`review-result review-result--${result}`}
                    disabled={saving || Boolean(pendingSessionCommit) || Boolean(completedEvent && !editingCompleted)}
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
  ), document.body);
}

function resolveSheetQuestion(entry: WrongAnswerEntry, questionNumber: string) {
  const normalized = normalizeQuestionNumber(questionNumber);
  const matches = getEntryQuestions(entry).filter((item) => normalizeQuestionNumber(item.questionNumber) === normalized);
  if (matches.length !== 1) return null;
  const question = matches[0];
  const block = resolvedQuestionToBlock(question);
  const answers = (entry.answerKey ?? []).filter(
    (item) =>
      normalizeQuestionNumber(item.questionNumber) === normalized ||
      normalizeQuestionNumber(item.questionNumber) === normalizeQuestionNumber(block.numberLabel),
  );
  return { block, question, answer: answers.length === 1 ? answers[0] : undefined };
}

function SheetQuestionReviewCard({
  block,
  question,
  answer,
  entry,
  onWikiLinkClick,
  existingTargets,
}: {
  block: QuestionBlock;
  question: ResolvedEntryQuestion;
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
      {question.passage && <section className="exam-passage"><QuestionContentView text={question.passage.text} figures={resolveQuestionFigures(entry, question)} appendUnreferencedFigures={false} /></section>}
      {question.contentSegments?.length ? <QuestionContentView referencedPassage={question.passage?.text} text={question.questionText} segments={question.contentSegments} choices={question.choices} figures={resolveQuestionFigures(entry, question)} appendUnreferencedFigures={false} /> : <LinkifiedText text={block.body} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} conceptContext={buildConceptLinkContext(entry, block.numberLabel)} />}

      {!question.contentSegments?.length && block.choices.length > 0 && (
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
