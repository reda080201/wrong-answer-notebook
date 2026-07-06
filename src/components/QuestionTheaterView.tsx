import { useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Annotation, AnnotationTool, QuestionMeta, ReviewResult, SheetAnswerItem, SheetFigureItem } from "../types";
import type { PassageBlock, ParagraphBlock, QuestionBlock } from "../utils/textLayout";
import { LinkifiedText } from "../utils/wikiLinks";
import MathText from "./MathText";
import { FocusedQuestionView } from "./AnnotatableQuestion";
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
  onClose,
}: QuestionTheaterViewProps) {
  const [solutionSplitOpen, setSolutionSplitOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);
  const [scoreEditorOpen, setScoreEditorOpen] = useState(false);
  const difficultyScore = normalizeDifficultyScore(questionMeta?.difficultyScore) ?? resolveAnswerDifficultyScore(answer);
  const [draftScore, setDraftScore] = useState(`${difficultyScore ?? ""}`);

  const updateSplitRatio = (clientX: number, container: HTMLElement) => {
    const rect = container.getBoundingClientRect();
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    const next = Math.max(45, Math.min(72, Math.round(ratio)));
    setSplitRatio(next);
    localStorage.setItem(SPLIT_RATIO_KEY, String(next));
  };

  const startDividerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const container = event.currentTarget.closest(".question-theater-main");
    if (!(container instanceof HTMLElement)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const handleMove = (moveEvent: PointerEvent) => updateSplitRatio(moveEvent.clientX, container);
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  return (
    <div className="question-theater" role="dialog" aria-modal="true" aria-label="문제 크게 보기">
      <div className="question-theater-shell">
        <header className="question-theater-toolbar">
          <button type="button" onClick={onPrevious} disabled={questionIndex <= 0}>
            이전
          </button>
          <strong>
            문제 {questionBlock.displayNumber}
            <span> / {questionCount}</span>
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
                        memo={memo}
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
                  <>
                    <h3>정답</h3>
                    <MathText text={answer.answer || "정답 없음"} />
                    {answer.explanation && (
                      <>
                        <h3>해설</h3>
                        <LinkifiedText
                          text={answer.explanation}
                          onLinkClick={onWikiLinkClick}
                          existingTargets={existingTargets}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p>연결된 답안지가 없습니다.</p>
            )}
          </article>
          <article>
            <h3>메모</h3>
            {answer?.notes || answer?.reviewPoint || answer?.wrongPoint || memo ? (
              <div className="memo-content">
                {[answer?.notes, answer?.wrongPoint, answer?.reviewPoint, memo].filter(Boolean).join("\n")}
              </div>
            ) : (
              <p>현재 문제에 표시할 메모가 없습니다.</p>
            )}
            <div className="review-actions">
              <button type="button" className="review-result review-result--again" onClick={() => onReview("again")}>
                다시
              </button>
              <button type="button" className="review-result review-result--hard" onClick={() => onReview("hard")}>
                어려움
              </button>
              <button type="button" className="review-result review-result--good" onClick={() => onReview("good")}>
                맞음
              </button>
            </div>
          </article>
        </section>}
      </div>
    </div>
  );
}

function TheaterSolutionContent({
  answer,
  memo,
  onWikiLinkClick,
  existingTargets,
}: {
  answer: SheetAnswerItem;
  memo?: string;
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
          <LinkifiedText text={answer.strategy} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} />
        </section>
      )}
      {(answer.steps?.length ?? 0) > 0 ? (
        <section>
          <h3>단계별 풀이</h3>
          <ol>
            {answer.steps?.map((step) => (
              <li key={step}><MathText text={step} /></li>
            ))}
          </ol>
        </section>
      ) : answer.explanation.trim() ? (
        <section>
          <h3>풀이 과정</h3>
          <LinkifiedText text={answer.explanation} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} />
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
      {[answer.notes, memo].filter(Boolean).length > 0 && (
        <section>
          <h3>메모</h3>
          <MathText text={[answer.notes, memo].filter(Boolean).join("\n")} />
        </section>
      )}
    </div>
  );
}
