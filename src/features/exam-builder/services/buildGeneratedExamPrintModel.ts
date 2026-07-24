import type { ExamPrintPreferences, GeneratedExam } from "../../../types";
import type { ExamPrintModel } from "../../export/types";
import { formatQuestionSourceLabel } from "./questionSource";

export function buildGeneratedExamPrintModel(exam: GeneratedExam, preferences: ExamPrintPreferences): ExamPrintModel {
  return {
    title: exam.title, subject: exam.subject, scopeLabel: "생성 모의고사", questionCount: exam.questions.length,
    preferences, preset: preferences.preset,
    questions: exam.questions.map((item) => ({ questionNumber: String(item.position), displayNumber: String(item.position), kind: item.snapshot.choices.length ? "objective" : "subjective", choices: item.snapshot.choices, segments: item.snapshot.contentSegments?.length ? item.snapshot.contentSegments : [{ id: "body", type: "text", text: item.snapshot.question }], figures: item.snapshot.figures, passage: item.snapshot.passage, workspaceSize: preferences.workspaceSize, sourceLabel: preferences.sourceDisplay === "below-question" ? formatQuestionSourceLabel(item.source) : undefined })),
    sourcePageImages: preferences.includeSourcePages ? [...new Set(exam.questions.flatMap((question) => question.snapshot.sourcePageImages ?? []))] : [],
    includeHeader: preferences.includeHeader, includeAnswerSheet: preferences.includeAnswerSheet, includePageNumbers: preferences.includePageNumbers, includeSourcePages: preferences.includeSourcePages, extraScratchPages: preferences.extraScratchPages,
    filenameBase: `${exam.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80)}-재풀이용`,
    sourceIndex: preferences.sourceDisplay === "index-at-end" || preferences.includeSourceIndex ? exam.questions.map((item) => ({ questionNumber: String(item.position), label: formatQuestionSourceLabel(item.source) })) : [],
  };
}
