import type { ExamPrintPreferences, ExamPrintPreset } from "../../../types";

export interface ExamPrintContentOptions {
  includeAnswers: boolean;
  includeExplanations: boolean;
  includePreviousAnswers: boolean;
  includeMemos: boolean;
  includeReview: boolean;
  includeAudit: boolean;
  includeFigures: boolean;
  includeSourcePages: boolean;
  includeLearningVisuals: boolean;
  includeBlankAnswerSheet: boolean;
  preferSingleColumn: boolean;
  enlargeWorkspace: boolean;
}

export const EXAM_PRINT_PRESET_LABELS: Record<ExamPrintPreset, string> = {
  real_exam: "실전 재풀이",
  spacious: "여유 있게 풀기",
  wrong_only: "오답만 다시 풀기",
  source_like: "원본에 가깝게",
  custom: "사용자 설정",
};

export const EXAM_PRINT_PRESETS: Record<ExamPrintPreset, ExamPrintContentOptions> = {
  real_exam: {
    includeAnswers: false,
    includeExplanations: false,
    includePreviousAnswers: false,
    includeMemos: false,
    includeReview: false,
    includeAudit: false,
    includeFigures: true,
    includeSourcePages: false,
    includeLearningVisuals: false,
    includeBlankAnswerSheet: true,
    preferSingleColumn: false,
    enlargeWorkspace: false,
  },
  spacious: {
    includeAnswers: false,
    includeExplanations: false,
    includePreviousAnswers: false,
    includeMemos: false,
    includeReview: false,
    includeAudit: false,
    includeFigures: true,
    includeSourcePages: false,
    includeLearningVisuals: false,
    includeBlankAnswerSheet: true,
    preferSingleColumn: true,
    enlargeWorkspace: true,
  },
  wrong_only: {
    includeAnswers: false,
    includeExplanations: false,
    includePreviousAnswers: false,
    includeMemos: false,
    includeReview: false,
    includeAudit: false,
    includeFigures: true,
    includeSourcePages: false,
    includeLearningVisuals: false,
    includeBlankAnswerSheet: true,
    preferSingleColumn: false,
    enlargeWorkspace: false,
  },
  source_like: {
    includeAnswers: false,
    includeExplanations: false,
    includePreviousAnswers: false,
    includeMemos: false,
    includeReview: false,
    includeAudit: false,
    includeFigures: true,
    includeSourcePages: false,
    includeLearningVisuals: false,
    includeBlankAnswerSheet: true,
    preferSingleColumn: false,
    enlargeWorkspace: false,
  },
  custom: {
    includeAnswers: false,
    includeExplanations: false,
    includePreviousAnswers: false,
    includeMemos: false,
    includeReview: false,
    includeAudit: false,
    includeFigures: true,
    includeSourcePages: false,
    includeLearningVisuals: false,
    includeBlankAnswerSheet: true,
    preferSingleColumn: false,
    enlargeWorkspace: false,
  },
};

export function resolveExamPrintContentOptions(
  preset: ExamPrintPreset,
  preferences?: Pick<ExamPrintPreferences, "includeAnswerSheet" | "includeSourcePages">,
  overrides: Partial<ExamPrintContentOptions> = {},
): ExamPrintContentOptions {
  const base = EXAM_PRINT_PRESETS[preset] ?? EXAM_PRINT_PRESETS.real_exam;
  return {
    ...base,
    includeBlankAnswerSheet: preferences?.includeAnswerSheet ?? base.includeBlankAnswerSheet,
    includeSourcePages: preferences?.includeSourcePages ?? base.includeSourcePages,
    ...overrides,
  };
}
