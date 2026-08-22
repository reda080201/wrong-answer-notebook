import StudyControlBar from "../../../components/StudyControlBar";
import type { ReviewResult } from "../../../types";
type DetailViewMode = "paper" | "solution" | "learning" | "analysis";

interface EntryDetailStudyControlsProps {
  isSheet: boolean;
  isConcept: boolean;
  questionIndex: number;
  questionCount: number;
  hideAnswers: boolean;
  detailViewMode: DetailViewMode;
  reviewSaving: ReviewResult | null;
  difficult: boolean;
  nextStudyAction?: { label: string; onExecute(): void };
  compact: boolean;
  showModeControls: boolean;
  quickMemoOpen: boolean;
  quickMemoText: string;
  onPrevious(): void;
  onNext(): void;
  onToggleAnswers(): void;
  onReview(result: ReviewResult): void;
  onToggleDifficult(): void;
  onModeChange(mode: string): void;
  onCompactChange(compact: boolean): void;
  onQuickMemoOpenChange(open: boolean): void;
  onQuickMemoTextChange(text: string): void;
  onQuickMemoSubmit(): void;
  onOpenGptExport?(): void;
}

export default function EntryDetailStudyControls({ isSheet, isConcept, questionIndex, questionCount, hideAnswers, detailViewMode, reviewSaving, difficult, nextStudyAction, compact, showModeControls, quickMemoOpen, quickMemoText, onPrevious, onNext, onToggleAnswers, onReview, onToggleDifficult, onModeChange, onCompactChange, onQuickMemoOpenChange, onQuickMemoTextChange, onQuickMemoSubmit, onOpenGptExport }: EntryDetailStudyControlsProps) {
  return <StudyControlBar
    isSheet={isSheet}
    isConcept={isConcept}
    questionIndex={questionIndex}
    questionCount={questionCount}
    hideAnswers={hideAnswers}
    detailViewMode={detailViewMode}
    difficult={difficult}
    reviewSaving={reviewSaving}
    nextStudyAction={nextStudyAction}
    compact={compact}
    showModeControls={showModeControls}
    quickMemoOpen={quickMemoOpen}
    quickMemoText={quickMemoText}
    onPrevious={onPrevious}
    onNext={onNext}
    onToggleAnswers={onToggleAnswers}
    onReview={onReview}
    onToggleDifficult={onToggleDifficult}
    onModeChange={onModeChange}
    onCompactChange={onCompactChange}
    onQuickMemoOpenChange={onQuickMemoOpenChange}
    onQuickMemoTextChange={onQuickMemoTextChange}
    onQuickMemoSubmit={onQuickMemoSubmit}
    onOpenGptExport={onOpenGptExport}
  />;
}
