import type { QuestionContentSegment, SheetFigureItem, StructuredQuestion } from "./entry";

export type ExamSessionStatus = "in_progress" | "submitted";

export interface ExamQuestionSnapshot {
  id: string;
  questionNumber: string;
  passage?: string;
  stimulusGroupId?: string;
  section?: string;
  questionType?: StructuredQuestion["questionType"];
  question: string;
  conditions?: string[];
  equations?: string[];
  choices: string[];
  questionImages: string[];
  /** 문항 직접 연결 정보가 없는 기존 시험지 원본 페이지 이미지입니다. */
  sourcePageImages?: string[];
  figures: SheetFigureItem[];
  contentSegments?: QuestionContentSegment[];
  needsReview?: boolean;
  correctAnswer?: string;
  explanation?: string;
  points?: number;
  warning?: string;
  sourceWarning?: string;
  figureIds?: string[];
  source?: StructuredQuestion["source"];
  generatedExamId?: string;
  sourceEntryId?: string;
  sourceQuestionNumber?: string;
  generatedQuestionPosition?: number;
}

export interface ExamResponse {
  questionNumber: string;
  response: string;
  scratchNote: string;
  markedForReview: boolean;
  updatedAt: string;
}

export interface ExamQuestionResult {
  questionNumber: string;
  correct: boolean;
  hasResponse: boolean;
  markedForReview: boolean;
}

export interface ExamSessionScore {
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  markedForReviewCount: number;
  percentCorrect: number;
  questionResults: ExamQuestionResult[];
  scoredAt: string;
}

export interface ExamSession {
  id: string;
  entryId: string;
  title: string;
  subject: string;
  status: ExamSessionStatus;
  questions: ExamQuestionSnapshot[];
  responses: ExamResponse[];
  currentQuestionIndex: number;
  startedAt: string;
  updatedAt: string;
  submittedAt?: string;
  score?: ExamSessionScore;
}

export interface ActiveExamContext {
  sessionId: string | null;
  questionId: string | null;
  questionIndex: number | null;
  userResponse: string;
  scratchNote: string;
  markedForReview: boolean;
  submitted: boolean;
  updatedAt: string;
  shareUserResponse?: boolean;
  shareScratchNote?: boolean;
  shareQuestionImages?: boolean;
  shareSourcePageImages?: boolean;
  contextUpdatedAt?: string;
}

export type GeneratedExamPreset = "real_exam" | "hard" | "important" | "quality" | "weakness" | "wrong_retry" | "random" | "custom";

export interface ExamBlueprintSlot {
  position: number;
  targetDifficultyMin?: number;
  targetDifficultyMax?: number;
  answerType?: "multiple_choice" | "short_answer" | "any";
  preferredUnits?: string[];
}

export interface ExamBlueprint {
  id: string;
  name: string;
  subject?: string;
  totalQuestions: number;
  totalPoints?: number;
  timeLimitMinutes?: number;
  slots: ExamBlueprintSlot[];
}

export interface GeneratedExamQuestion {
  position: number;
  points?: number;
  source: QuestionSourceReference;
  /** @deprecated Loaded only for legacy migration. */
  sourceEntryId?: string;
  /** @deprecated Loaded only for legacy migration. */
  sourceQuestionNumber?: string;
  snapshot: ExamQuestionSnapshot;
  locked: boolean;
  selectionScore: number;
  selectionReasons: string[];
}

export type QuestionSourceStatus = "linked" | "snapshot_only" | "missing" | "unknown";

export interface QuestionSourceReference {
  sourceEntryId: string;
  sourceEntryTitle: string;
  sourceQuestionNumber: string;
  sourceSubject?: string;
  sourceExamName?: string;
  sourceExamRound?: string;
  sourceSection?: string;
  sourceTags?: string[];
  sourceSnapshotHash?: string;
  sourceStatus?: QuestionSourceStatus;
}

export interface ExamGenerationReport {
  candidateCount: number;
  selectedCount: number;
  excludedCounts: Record<string, number>;
  difficultyDistribution: Record<string, number>;
  unitDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  relaxedConstraints: string[];
  warnings: string[];
  usedGeminiEvaluation: boolean;
  generatedAt: string;
}

export interface GeneratedExam {
  id: string;
  title: string;
  subject: string;
  blueprintId?: string;
  preset: GeneratedExamPreset;
  createdAt: string;
  updatedAt: string;
  seed: string;
  status: "draft" | "ready" | "archived";
  timeLimitMinutes?: number;
  totalPoints?: number;
  questions: GeneratedExamQuestion[];
  generationReport: ExamGenerationReport;
}
