import type { ReviewResult } from "../types";

type DetailViewMode = "paper" | "solution" | "analysis";

interface NextActionButtonProps {
  hideAnswers: boolean;
  canGoNext: boolean;
  reviewSaving: ReviewResult | null;
  onToggleAnswers: () => void;
  onNext: () => void;
  onReviewGood: () => void;
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
  quickMemoOpen: boolean;
  quickMemoText: string;
  onPrevious: () => void;
  onNext: () => void;
  onToggleAnswers: () => void;
  onReview: (result: ReviewResult) => void;
  onToggleDifficult: () => void;
  onModeChange: (mode: DetailViewMode) => void;
  onQuickMemoOpenChange: (open: boolean) => void;
  onQuickMemoTextChange: (text: string) => void;
  onQuickMemoSubmit: () => void;
}

function NextActionButton({
  hideAnswers,
  canGoNext,
  reviewSaving,
  onToggleAnswers,
  onNext,
  onReviewGood,
}: NextActionButtonProps) {
  if (reviewSaving !== null) {
    return (
      <button type="button" className="study-next-action" aria-label="하단 다음 행동" disabled>
        저장 중...
      </button>
    );
  }

  if (hideAnswers) {
    return (
      <button type="button" className="study-next-action" aria-label="하단 다음 행동" onClick={onToggleAnswers}>
        정답 보기
      </button>
    );
  }

  if (canGoNext) {
    return (
      <button type="button" className="study-next-action" aria-label="하단 다음 행동" onClick={onNext}>
        다음 문제
      </button>
    );
  }

  return (
    <button
      type="button"
      className="study-next-action"
      aria-label="하단 다음 행동"
      onClick={onReviewGood}
    >
      맞음으로 기록
    </button>
  );
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
  quickMemoOpen,
  quickMemoText,
  onPrevious,
  onNext,
  onToggleAnswers,
  onReview,
  onToggleDifficult,
  onModeChange,
  onQuickMemoOpenChange,
  onQuickMemoTextChange,
  onQuickMemoSubmit,
}: StudyControlBarProps) {
  const canMove = isSheet && questionCount > 1;
  const canGoPrevious = canMove && questionIndex > 0;
  const canGoNext = canMove && questionIndex < questionCount - 1;
  const showSecondaryGood = !isConcept && (hideAnswers || canGoNext);

  return (
    <div className="study-control-bar" aria-label="학습 빠른 조작">
      {quickMemoOpen && (
        <div className="study-quick-memo">
          <textarea
            value={quickMemoText}
            onChange={(event) => onQuickMemoTextChange(event.target.value)}
            placeholder="빠른 메모를 한 줄로 남기기"
            aria-label="빠른 메모 입력"
          />
          <button type="button" onClick={onQuickMemoSubmit} disabled={!quickMemoText.trim()}>
            메모 저장
          </button>
        </div>
      )}

      <div className="study-control-row study-control-row--primary">
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

        {!isConcept && (
          <div className="study-next-action-wrap">
            <NextActionButton
              hideAnswers={hideAnswers}
              canGoNext={canGoNext}
              reviewSaving={reviewSaving}
              onToggleAnswers={onToggleAnswers}
              onNext={onNext}
              onReviewGood={() => onReview("good")}
            />
            <span className="study-control-counter">
              {isSheet && questionCount > 0 ? `${questionIndex + 1} / ${questionCount}` : "단일 문제"}
            </span>
          </div>
        )}

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
      </div>

      <div className="study-control-row study-control-row--secondary">
        {!isConcept && (
          <div className="study-control-group study-control-group--review">
            <button type="button" aria-label="하단 다시" onClick={() => onReview("again")} disabled={reviewSaving !== null}>
              ↺ 다시
            </button>
            <button type="button" aria-label="하단 어려움" onClick={() => onReview("hard")} disabled={reviewSaving !== null}>
              ★ 어려움
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
              aria-label={difficult ? "하단 북마크 해제" : "하단 북마크"}
            aria-pressed={difficult}
          >
              {difficult ? "★ 북마크" : "☆ 북마크"}
            </button>
          </div>
        )}

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
            className={detailViewMode === "analysis" ? "active" : ""}
            aria-label="하단 분석 모드"
            onClick={() => onModeChange("analysis")}
            disabled={isConcept}
          >
            분석
          </button>
        </div>

        <button
          type="button"
          className={`study-memo-toggle ${quickMemoOpen ? "active" : ""}`}
          aria-label="하단 빠른 메모"
          onClick={() => onQuickMemoOpenChange(!quickMemoOpen)}
        >
          메모
        </button>
      </div>
    </div>
  );
}
