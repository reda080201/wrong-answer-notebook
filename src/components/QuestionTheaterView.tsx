import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { writeUiStorageValue } from "../services/uiStorage";
import type { Annotation, AnnotationTool, QuestionMeta, ReviewResult, SheetAnswerItem, SheetFigureItem } from "../types";
import type { PassageBlock, ParagraphBlock, QuestionBlock } from "../utils/textLayout";
import { LinkifiedText } from "../utils/wikiLinks";
import MathText from "./MathText";
import { FocusedQuestionView } from "./AnnotatableQuestion";
import { buildConceptLinkContext } from "../features/learning/utils/conceptIndex";
import {
  difficultyScoreBand,
  difficultyScoreLabel,
  normalizeDifficultyScore,
  resolveAnswerDifficultyScore,
} from "../utils/difficulty";

interface QuestionTheaterViewProps {
  passage?: PassageBlock | ParagraphBlock;
  questionBlock: QuestionBlock;
  questionIndex: number;
  questionCount: number;
  answer?: SheetAnswerItem;
  questionMeta?: QuestionMeta;
  sourceEntry?: import("../types").WrongAnswerEntry;
  questionImages: string[];
  figures: SheetFigureItem[];
  annotations: Annotation[];
  memoMode: boolean;
  activeTool: AnnotationTool | "erase";
  hideAnswers: boolean;
  memo?: string;
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  onPrevious: () => void;
  onNext: () => void;
  onToggleAnswers: () => void;
  onToggleImportant?: () => void;
  onDifficultyScoreChange?: (score: number | undefined) => void;
  onOpenGptExport?: () => void;
  onReview: (result: ReviewResult) => void;
  reviewSaving?: boolean;
  onClose: () => void;
}

const SPLIT_RATIO_KEY = "wrong-answer-question-theater-split-ratio";

function loadSplitRatio() {
  const saved = Number(localStorage.getItem(SPLIT_RATIO_KEY));
  return Number.isFinite(saved) && saved >= 45 && saved <= 72 ? saved : 58;
}

export default function QuestionTheaterView({
  passage,
  questionBlock,
  questionIndex,
  questionCount,
  answer,
  questionMeta,
  sourceEntry,
  questionImages,
  figures,
  annotations,
  memoMode,
  activeTool,
  hideAnswers,
  memo,
  onAnnotationsChange,
  onWikiLinkClick,
  existingTargets,
  onPrevious,
  onNext,
  onToggleAnswers,
  onToggleImportant,
  onDifficultyScoreChange,
  onOpenGptExport,
  onReview,
  reviewSaving = false,
  onClose,
}: QuestionTheaterViewProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [solutionSplitOpen, setSolutionSplitOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);
  const [scoreEditorOpen, setScoreEditorOpen] = useState(false);
  const difficultyScore = normalizeDifficultyScore(questionMeta?.difficultyScore) ?? resolveAnswerDifficultyScore(answer);
  const conceptContext = sourceEntry ? buildConceptLinkContext(sourceEntry, questionMeta?.questionNumber ?? answer?.questionNumber) : undefined;
  const [draftScore, setDraftScore] = useState(`${difficultyScore ?? ""}`);

  const updateSplitRatio = (clientX: number, container: HTMLElement) => {
    const rect = container.getBoundingClientRect();
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    const next = Math.max(45, Math.min(72, Math.round(ratio)));
    setSplitRatio(next);
    writeUiStorageValue(SPLIT_RATIO_KEY, String(next));
  };

  const startDividerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const container = event.currentTarget.closest(".question-theater-main");
    if (!(container instanceof HTMLElement)) return;
    const divider = event.currentTarget;
    divider.setPointerCapture(event.pointerId);
    const handleMove = (moveEvent: PointerEvent) => updateSplitRatio(moveEvent.clientX, container);
    dragCleanupRef.current?.();
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      if (divider.hasPointerCapture(event.pointerId)) {
        divider.releasePointerCapture(event.pointerId);
      }
      dragCleanupRef.current = null;
    };
    dragCleanupRef.current = handleUp;
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
  };

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      dragCleanupRef.current?.();
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div ref={dialogRef} className="question-theater" role="dialog" aria-modal="true" aria-label="문제 크게 보기" tabIndex={-1}>
      <div className="question-theater-shell">
        <header className="question-theater-toolbar">
          <button type="button" onClick={onPrevious} disabled={questionIndex <= 0}>
            이전
          </button>
          <strong>
            문제 {questionBlock.numberLabel || questionBlock.displayNumber}
            <span>{questionIndex + 1} / {questionCount}</span>
          </strong>
          <button type="button" onClick={onNext} disabled={questionIndex >= questionCount - 1}>
            다음
          </button>
          {onToggleImportant && (
            <button
              type="button"
              className={`question-theater-important ${questionMeta?.important ? "active" : ""}`}
              onClick={onToggleImportant}
              aria-pressed={Boolean(questionMeta?.important)}
            >
              {questionMeta?.important ? "★ 중요" : "☆ 중요"}
            </button>
          )}
          {difficultyScore && (
            <span className={`difficulty-score-pill difficulty-score-pill--${difficultyScoreBand(difficultyScore)}`}>
              {difficultyScoreLabel(difficultyScore)}
            </span>
          )}
          {onDifficultyScoreChange && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setDraftScore(`${difficultyScore ?? ""}`);
                setScoreEditorOpen((value) => !value);
              }}
            >
              난이도 수정
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => setSolutionSplitOpen((value) => !value)}>
            {solutionSplitOpen ? "문제만 보기" : "해설 보기"}
          </button>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="문제 크게 보기 닫기">
            나가기
          </button>
        </header>
        {scoreEditorOpen && onDifficultyScoreChange && (
          <div className="question-theater-score-editor">
            <input
              type="range"
              min={1}
              max={100}
              value={normalizeDifficultyScore(draftScore) ?? difficultyScore ?? 50}
              onChange={(event) => setDraftScore(event.target.value)}
              aria-label="현재 문제 난이도 점수"
            />
            <input
              type="number"
              min={1}
              max={100}
              value={draftScore}
              onChange={(event) => setDraftScore(event.target.value)}
              placeholder="1~100"
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                onDifficultyScoreChange(normalizeDifficultyScore(draftScore));
                setScoreEditorOpen(false);
              }}
            >
              저장
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                onDifficultyScoreChange(undefined);
                setDraftScore("");
                setScoreEditorOpen(false);
              }}
            >
              자동
            </button>
          </div>
        )}

        <main
          className={`question-theater-main ${solutionSplitOpen ? "question-theater-main--split" : ""}`}
          style={solutionSplitOpen ? { ["--question-split-ratio" as string]: `${splitRatio}%` } : undefined}
        >
          <section className="question-theater-question-pane">
            {questionMeta?.important && (
            <div className="question-theater-bookmark-note">
              <strong>중요 표시된 문제</strong>
              {questionMeta.bookmarkLabel && <span>{questionMeta.bookmarkLabel}</span>}
              {questionMeta.note && <span>{questionMeta.note}</span>}
            </div>
            )}
            <FocusedQuestionView
              passage={passage}
              questionBlock={questionBlock}
              questionImages={questionImages}
              figures={figures}
              annotations={annotations}
              memoMode={memoMode}
              activeTool={activeTool}
              onAnnotationsChange={onAnnotationsChange}
              onWikiLinkClick={onWikiLinkClick}
              existingTargets={existingTargets}
              showImages
            />
          </section>
          {solutionSplitOpen && (
            <>
              <button
                type="button"
                className="question-theater-divider"
                aria-label="문제와 해설 영역 크기 조절"
                onPointerDown={startDividerDrag}
              />
              <aside className="question-theater-solution-pane" aria-label="현재 문제 해설">
                <div className="question-theater-solution-actions">
                  <button type="button" className="btn-secondary" onClick={onToggleAnswers}>
                    {hideAnswers ? "정답 보기" : "정답 가리기"}
                  </button>
                  {onOpenGptExport && (
                    <button type="button" className="btn-secondary" onClick={onOpenGptExport}>
                      GPT에게 이 문제 보내기
                    </button>
                  )}
                </div>
                {answer ? (
                  <div className={hideAnswers ? "answer-hidden" : ""}>
                    {hideAnswers ? (
                      <p>정답과 해설이 가려져 있습니다.</p>
                    ) : (
                      <TheaterSolutionContent
                        answer={answer}
                        conceptContext={conceptContext}
                        onWikiLinkClick={onWikiLinkClick}
                        existingTargets={existingTargets}
                      />
                    )}
                  </div>
                ) : (
                  <p>연결된 답안지가 없습니다.</p>
                )}
              </aside>
            </>
          )}
        </main>

        {!solutionSplitOpen && <section className="question-theater-panels">
          <article>
            <button type="button" className="btn-secondary" onClick={onToggleAnswers}>
              {hideAnswers ? "정답 보기" : "정답 가리기"}
            </button>
            {answer ? (
              <div className={hideAnswers ? "answer-hidden" : ""}>
                {hideAnswers ? (
                  <p>정답이 가려져 있습니다.</p>
                ) : (
                  <TheaterSolutionContent
                    answer={answer}
                    conceptContext={conceptContext}
                    includeMemo={false}
                    onWikiLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                  />
                )}
              </div>
            ) : (
              <p>연결된 답안지가 없습니다.</p>
            )}
          </article>
          <article>
            <h3>현재 문제 메모</h3>
            {answer?.notes || answer?.reviewPoint || answer?.wrongPoint ? (
              <div className="memo-content">
                {[answer?.notes, answer?.wrongPoint, answer?.reviewPoint].filter(Boolean).join("\n")}
              </div>
            ) : (
              <p>현재 문제에 표시할 메모가 없습니다.</p>
            )}
            <div className="review-actions">
              <button type="button" className="review-result review-result--again" disabled={reviewSaving} onClick={() => onReview("again")}>
                다시
              </button>
              <button type="button" className="review-result review-result--hard" disabled={reviewSaving} onClick={() => onReview("hard")}>
                어려움
              </button>
              <button type="button" className="review-result review-result--good" disabled={reviewSaving} onClick={() => onReview("good")}>
                맞음
              </button>
            </div>
          </article>
          {memo?.trim() && <article>
            <h3>시험지 전체 메모</h3>
            <div className="memo-content"><MathText text={memo} /></div>
          </article>}
        </section>}
      </div>
    </div>
  );
}

function TheaterSolutionContent({
  answer,
  conceptContext,
  includeMemo = true,
  onWikiLinkClick,
  existingTargets,
}: {
  answer: SheetAnswerItem;
  conceptContext?: import("../features/learning/utils/conceptIndex").ConceptLinkResolveContext;
  includeMemo?: boolean;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}) {
  return (
    <div className="question-theater-solution-content">
      <section>
        <h3>정답</h3>
        <MathText text={answer.answer || "정답 없음"} />
      </section>
      {answer.strategy?.trim() && (
        <section>
          <h3>풀이 전략</h3>
          <LinkifiedText text={answer.strategy} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} conceptContext={conceptContext} />
        </section>
      )}
      {(answer.steps?.length ?? 0) > 0 ? (
        <section>
          <h3>단계별 풀이</h3>
          <ol>
            {answer.steps?.map((step, index) => (
              <li key={`${answer.id}-step-${index}`}><LinkifiedText text={step} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} conceptContext={conceptContext} /></li>
            ))}
          </ol>
        </section>
      ) : answer.explanation.trim() ? (
        <section>
          <h3>풀이 과정</h3>
          <LinkifiedText text={answer.explanation} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} conceptContext={conceptContext} />
        </section>
      ) : null}
      {(answer.choiceJudgements?.length ?? 0) > 0 && (
        <section>
          <h3>보기별 판단</h3>
          <ul>
            {answer.choiceJudgements?.map((item) => (
              <li key={`${item.marker}-${item.text}`}>
                <strong>{item.marker}</strong> <MathText text={item.text} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {answer.wrongPoint?.trim() && (
        <section>
          <h3>오답 포인트</h3>
          <MathText text={answer.wrongPoint} />
        </section>
      )}
      {answer.reviewPoint?.trim() && (
        <section>
          <h3>복습 포인트</h3>
          <MathText text={answer.reviewPoint} />
        </section>
      )}
      {includeMemo && answer.notes?.trim() && (
        <section>
          <h3>문제별 메모</h3>
          <MathText text={answer.notes} />
        </section>
      )}
    </div>
  );
}
