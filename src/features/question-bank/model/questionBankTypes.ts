import type {
  EntryKind,
  ProblemSourceInfo,
  ProblemSourceType,
  QuestionAnswerType,
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
  isMastered: boolean;
  reviewDue: boolean;
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
};
