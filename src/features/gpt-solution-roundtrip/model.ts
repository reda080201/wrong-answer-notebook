import type { LearningBlockType } from "../../models/learning";
import type { SheetAnswerItem } from "../../models/entry";

export type GptSolutionPurpose =
  | "hint"
  | "full_solution"
  | "wrong_answer_analysis"
  | "lecture"
  | "solution_and_lecture";

export type GptSolutionField =
  | "answer"
  | "strategy"
  | "steps"
  | "explanation"
  | "concepts"
  | "wrongPoint"
  | "reviewPoint";

export type GptSolutionFieldResolution = "existing" | "incoming" | "fill";

export interface GptSolutionResponse {
  entryId: string;
  questionNumbers: string[];
  solutions: GptSolution[];
}

export interface GptSolution {
  questionNumber: string;
  answer?: string;
  strategy?: string;
  steps?: string[];
  explanation?: string;
  concepts?: string[];
  wrongPoint?: string;
  reviewPoint?: string;
  learningBlocks: GptSolutionLearningBlock[];
}

export interface GptSolutionLearningBlock {
  type: LearningBlockType;
  title: string;
  content: string;
  sourceQuestionNumber: string;
}

export interface GptSolutionValidationOptions {
  entryId: string;
  requestedQuestionNumbers: readonly string[];
  availableQuestionNumbers?: readonly string[];
}

export interface GptSolutionValidationResult {
  valid: boolean;
  response?: GptSolutionResponse;
  errors: string[];
  warnings: string[];
  discardedQuestionNumbers: string[];
}

export type GptSolutionFieldStatus = "new" | "fill" | "unchanged" | "conflict";

export interface GptSolutionFieldDiff {
  field: GptSolutionField;
  existing: unknown;
  incoming: unknown;
  status: GptSolutionFieldStatus;
  defaultResolution: GptSolutionFieldResolution;
}

export interface GptSolutionLearningBlockDiff {
  block: GptSolutionLearningBlock;
  status: "append" | "duplicate";
}

export interface GptSolutionDiffRow {
  questionNumber: string;
  existing?: SheetAnswerItem;
  incoming: GptSolution;
  fields: GptSolutionFieldDiff[];
  learningBlocks: GptSolutionLearningBlockDiff[];
}

export interface GptSolutionMergeAnalysis {
  entryId: string;
  requestedQuestionNumbers: string[];
  rows: GptSolutionDiffRow[];
  warnings: string[];
}

export interface GptSolutionResolution {
  questionNumber: string;
  approved: boolean;
  fields?: Partial<Record<GptSolutionField, GptSolutionFieldResolution>>;
  includeLearningBlocks?: boolean;
}

export interface GptSolutionApplyResult<Entry> {
  entry: Entry;
  appliedQuestionNumbers: string[];
  appendedLearningBlockIds: string[];
}
