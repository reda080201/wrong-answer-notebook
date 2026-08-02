import type { WrongAnswerEntry } from "./entry";

export type MistakeCauseType =
  | "calculation"
  | "condition_misread"
  | "concept_gap"
  | "strategy_gap"
  | "time_pressure"
  | "choice_trap"
  | "careless"
  | "unknown";

export type MistakeCauseSeverity = "low" | "medium" | "high";

export type MistakeAnalysisConfidence = "user" | "gpt" | "inferred";

export type ReviewStrategy =
  | "concept_review"
  | "drill"
  | "similar_problem"
  | "timed_retry"
  | "choice_review"
  | "solution_pattern_review";

export interface MistakeCause {
  type: MistakeCauseType;
  label?: string;
  severity: MistakeCauseSeverity;
  note?: string;
}

export interface MistakeAnalysis {
  causes: MistakeCause[];
  primaryCause?: MistakeCauseType;
  confidence?: MistakeAnalysisConfidence;
  preventionNote?: string;
  practiceMode?: ReviewStrategy;
}

export type ReviewResult = "again" | "hard" | "good";

export type ReviewPhase = "learning" | "relearning" | "long_term" | "archived";

export interface ReviewEvent {
  id: string;
  reviewedAt: string;
  result: ReviewResult;
  nextDueAt: string | null;
  intervalDays: number;
  causeSnapshot?: MistakeCauseType[];
  strategy?: ReviewStrategy;
  stabilityDays?: number;
  memoryDifficulty?: number;
  lapseCount?: number;
}

export interface ReviewState {
  dueAt: string | null;
  lastReviewedAt?: string;
  intervalDays: number;
  streak: number;
  history: ReviewEvent[];
  stabilityDays?: number;
  memoryDifficulty?: number;
  lapseCount?: number;
  preLapseStabilityDays?: number;
  relearningStep?: 0 | 1;
  repetitionCount?: number;
  phase?: ReviewPhase;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface ReviewAttempt {
  id: string;
  entryId: string;
  questionNumber?: string;
  reviewedAt: string;
  answerText?: string;
  correct: boolean;
  durationSeconds?: number;
  confidence?: "low" | "medium" | "high";
  hintUsed?: boolean;
  blockedStage?: "concept" | "interpretation" | "strategy" | "calculation" | "verification";
  mistakeCause?: MistakeCauseType;
  result: ReviewResult;
}

export type ReviewItem =
  | { kind: "entry"; entry: WrongAnswerEntry }
  | { kind: "sheet-question"; entry: WrongAnswerEntry; questionNumber: string };
