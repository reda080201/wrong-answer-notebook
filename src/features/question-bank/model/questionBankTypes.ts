import type {
  EntryKind,
  ProblemSourceInfo,
  ProblemSourceType,
  QuestionAnswerType,
  QuestionBankSort,
} from "../../../types";
import type { ResolvedQuestionClassification } from "../../../utils/questionClassification";

export interface QuestionBankItem {
  id: string;
  entryId: string;
  entryTitle: string;
  entryKind: EntryKind;
  questionNumber: string;
  questionId?: string;
  subject: string;
  questionText: string;
  source: ProblemSourceInfo;
  classification: ResolvedQuestionClassification;
  answer?: string;
  explanation?: string;
  questionImages: string[];
  sourcePageImages: string[];
  hasAnswer: boolean;
  hasExplanation: boolean;
  hasImages: boolean;
  isWrong: boolean;
  /** Derived for new projections; legacy test/consumer fixtures may omit it. */
  isImportant?: boolean;
  isMastered: boolean;
  reviewDue: boolean;
  /** Last real review event; absent means this item was never reviewed. */
  lastReviewedAt?: string;
  updatedAt: string;
}

export interface QuestionBankFilters {
  search: string;
  subject: string;
  sourceType: ProblemSourceType | "all";
  unit: string;
  subunit: string;
  concept: string;
  minDifficulty: number | null;
  minImportance: number | null;
  minQuality: number | null;
  answerType: QuestionAnswerType | "all";
  wrongOnly: boolean;
  answerState: "all" | "has" | "missing";
  explanationState: "all" | "has" | "missing";
  hasImages: "all" | "has" | "missing";
  reviewDueOnly: boolean;
  year: string;
  tag: string;
}

export const DEFAULT_QUESTION_BANK_FILTERS: QuestionBankFilters = {
  search: "",
  subject: "all",
  sourceType: "all",
  unit: "all",
  subunit: "all",
  concept: "all",
  minDifficulty: null,
  minImportance: null,
  minQuality: null,
  answerType: "all",
  wrongOnly: false,
  answerState: "all",
  explanationState: "all",
  hasImages: "all",
  reviewDueOnly: false,
  year: "all",
  tag: "all",
};

export const QUESTION_BANK_SORT_LABELS: Record<QuestionBankSort, string> = {
  updated: "최근 수정",
  difficulty: "난이도 높은 순",
  importance: "중요도 높은 순",
  quality: "품질 높은 순",
  review_due: "복습 예정 순",
};
