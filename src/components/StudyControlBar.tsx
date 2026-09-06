import { useState } from "react";
import type { ReviewResult } from "../types";

type DetailViewMode = "paper" | "solution" | "learning" | "analysis";

export interface StudyNextAction {
  label: string;
  disabled?: boolean;
  onExecute: () => void;
}


interface StudyControlBarProps {
  isSheet: boolean;
  isConcept: boolean;
  questionIndex: number;
  questionCount: number;
  hideAnswers: boolean;
  detailViewMode: DetailViewMode;
  difficult: boolean;
  reviewSaving: ReviewResult | null;
  nextStudyAction?: StudyNextAction;
  compact: boolean;
  showModeControls: boolean;
  quickMemoOpen: boolean;
  quickMemoText: string;
  onPrevious: () => void;
  onNext: () => void;
  onToggleAnswers: () => void;
  onReview: (result: ReviewResult) => void;
  onToggleDifficult: () => void;
  onModeChange: (mode: DetailViewMode) => void;
  onCompactChange: (compact: boolean) => void;
  onQuickMemoOpenChange: (open: boolean) => void;
  onQuickMemoTextChange: (text: string) => void;
  onQuickMemoSubmit: () => void;
  onOpenGptExport?: () => void;
}

export default function StudyControlBar({
  isSheet,
  isConcept,
  questionIndex,
  questionCount,
  hideAnswers,
  detailViewMode,
  difficult,
  reviewSaving,
  nextStudyAction,
  compact,
  showModeControls,
  quickMemoOpen,
  quickMemoText,
  onPrevious,
  onNext,
  onToggleAnswers,
  onReview,
  onToggleDifficult,
  onModeChange,
  onCompactChange,
  onQuickMemoOpenChange,
  onQuickMemoTextChange,
  onQuickMemoSubmit,
  onOpenGptExport,
}: StudyControlBarProps) {
  const canMove = isSheet && questionCount > 1;
  const canGoPrevious = canMove && questionIndex > 0;
  const canGoNext = canMove && questionIndex < questionCount - 1;
  const showSecondaryGood = !isConcept && (hideAnswers || canGoNext);
  const [toolsOpen, setToolsOpen] = useState(false);

  const renderQuickMemo = () =>
    quickMemoOpen ? (
      <div className="study-quick-memo">
        <textarea
          value={quickMemoText}
          onChange={(event) => onQuickMemoTextChange(event.target.value)}
          placeholder="빠른 메모를 남기기"
          aria-label="빠른 메모 입력"
        />
        <button type="button" onClick={onQuickMemoSubmit} disabled={!quickMemoText.trim()}>
          메모 저장
        </button>
      </div>
    ) : null;

  const renderPrimaryRow = () => (
    <div className={`study-control-row study-control-row--primary ${compact ? "study-control-row--compact" : ""}`}>
        {!isConcept && (
          <button
            type="button"
            className="study-control-nav-button"
            aria-label="하단 이전 문제"
            onClick={onPrevious}
            disabled={!canGoPrevious}
          >
            이전
          </button>
        )}

        {!isConcept && <span className="study-control-counter">{isSheet && questionCount > 0 ? `${questionIndex + 1} / ${questionCount}` : "단일 문제"}</span>}

        {!isConcept && (
          <button
            type="button"
            className="study-control-nav-button"
            aria-label="하단 다음 문제"
            onClick={onNext}
            disabled={!canGoNext}
          >
            다음
          </button>
        )}

        {!isConcept && <button type="button" className="study-control-nav-button" aria-label={hideAnswers ? "정답 보기" : "맞음 기록"} onClick={hideAnswers ? onToggleAnswers : () => onReview("good")} disabled={reviewSaving !== null}>{hideAnswers ? "정답 보기" : "맞음 기록"}</button>}
        {onOpenGptExport && !isConcept && <button type="button" className="study-control-nav-button" onClick={onOpenGptExport}>AI</button>}

        <button
          type="button"
          className={`study-control-tools-button ${toolsOpen ? "active" : ""}`}
          aria-label={toolsOpen ? "하단 도구 닫기" : "하단 도구 열기"}
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((open) => !open)}
        >
          {toolsOpen ? "도구 닫기" : "도구 열기"}
        </button>
      </div>
  );

  const renderSecondaryRow = (isCompactTools = false) => (
    <div
      className={`study-control-row study-control-row--secondary ${
        isCompactTools ? "study-control-row--compact-tools" : ""
      }`}
    >
        {!isConcept && (
          <div className="study-control-group study-control-group--review">
            <button type="button" aria-label="하단 다시" onClick={() => onReview("again")} disabled={reviewSaving !== null}>
              ↺ 다시
            </button>
            <button type="button" aria-label="하단 어려웠음 평가" onClick={() => onReview("hard")} disabled={reviewSaving !== null}>
              어려웠음
            </button>
            {showSecondaryGood && (
              <button type="button" aria-label="하단 맞음" onClick={() => onReview("good")} disabled={reviewSaving !== null}>
                ✓ 맞음
              </button>
            )}
            <button
              type="button"
              className={difficult ? "active" : ""}
              onClick={onToggleDifficult}
              aria-label={difficult ? "하단 어려운 문제 표시 해제" : "하단 어려운 문제로 표시"}
            aria-pressed={difficult}
          >
              {difficult ? "★ 어려운 문제" : "☆ 어려운 문제로 표시"}
            </button>
          </div>
        )}

        {showModeControls && (
          <div className="study-control-group study-control-group--modes">
            <button
              type="button"
              className={detailViewMode === "paper" ? "active" : ""}
              aria-label="하단 문제지 모드"
              onClick={() => onModeChange("paper")}
            >
              문제
            </button>
            <button
              type="button"
              className={detailViewMode === "solution" ? "active" : ""}
              aria-label="하단 해설지 모드"
              onClick={() => onModeChange("solution")}
              disabled={isConcept}
            >
              해설
            </button>
            <button
              type="button"
              className={detailViewMode === "learning" ? "active" : ""}
              aria-label="하단 특강 모드"
              onClick={() => onModeChange("learning")}
              disabled={isConcept}
            >
              특강
            </button>
            <button
              type="button"
              className={detailViewMode === "analysis" ? "active" : ""}
              aria-label="하단 분석 모드"
              onClick={() => onModeChange("analysis")}
              disabled={isConcept}
            >
              분석
            </button>
          </div>
        )}

        <button
          type="button"
          className={`study-memo-toggle ${quickMemoOpen ? "active" : ""}`}
          aria-label="하단 빠른 메모"
          onClick={() => onQuickMemoOpenChange(!quickMemoOpen)}
        >
          메모
        </button>
        <button
          type="button"
          className="study-memo-toggle"
          onClick={() => window.dispatchEvent(new CustomEvent("wrong-answer:restore-study-zoom"))}
        >
          줌 컨트롤 다시 표시
        </button>
        {nextStudyAction && !isConcept && (
          <button type="button" className="study-memo-toggle" onClick={nextStudyAction?.onExecute} disabled={!nextStudyAction || nextStudyAction.disabled}>
            {nextStudyAction?.label ?? "다음 행동"}
          </button>
        )}
        <button
          type="button"
          className="study-compact-toggle"
          aria-label={compact ? "하단바 펼침 모드" : "하단바 컴팩트 모드"}
          onClick={() => {
            const nextCompact = !compact;
            onCompactChange(nextCompact);
            setToolsOpen(false);
          }}
        >
          {compact ? "펼침" : "컴팩트"}
        </button>
      </div>
  );

  return (
    <div className={`study-control-bar ${compact ? "study-control-bar--compact" : ""}`} aria-label="학습 빠른 조작">
      {renderQuickMemo()}
      {renderPrimaryRow()}
      {toolsOpen && renderSecondaryRow(compact)}
    </div>
  );
}
