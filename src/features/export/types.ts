import type {
  ExamPrintPreferences,
  ExamPrintPreset,
  ExportScopeMode,
  QuestionContentSegment,
  SheetFigureItem,
} from "../../types";

export type ExportHubView = "home" | "exam-pdf" | "exam-preview" | "chatgpt-share" | "questions";

export interface ExamPrintQuestionModel {
  questionNumber: string;
  displayNumber: string;
  kind: "objective" | "subjective";
  choices: string[];
  segments: QuestionContentSegment[];
  figures: SheetFigureItem[];
  passage?: string;
  workspaceSize: ExamPrintPreferences["workspaceSize"];
  sourceLabel?: string;
}

export interface ExamPrintModel {
  title: string;
  subject: string;
  scopeLabel: string;
  questionCount: number;
  preferences: ExamPrintPreferences;
  preset: ExamPrintPreset;
  questions: ExamPrintQuestionModel[];
  sourcePageImages: string[];
  includeHeader: boolean;
  includeAnswerSheet: boolean;
  includePageNumbers: boolean;
  includeSourcePages: boolean;
  extraScratchPages: number;
  filenameBase: string;
  sourceIndex?: Array<{ questionNumber: string; label: string }>;
}

export interface AnswerProtectionContext {
  submitted: boolean;
  allowAnswers: boolean;
}

export interface ChatGptSharePayloadQuestion {
  questionNumber: string;
  passage?: string;
  contentSegments?: QuestionContentSegment[];
  choices: string[];
  images: string[];
  userResponse?: string;
  scratchNote?: string;
}

export interface ChatGptSharePayload {
  title: string;
  subject: string;
  scope: ExportScopeMode;
  questionNumbers: string[];
  submitted: boolean;
  answerProtection: "active" | "released";
  questions: ChatGptSharePayloadQuestion[];
}
