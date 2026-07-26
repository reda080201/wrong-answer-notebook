import type { ExamPrintPreferences, ExamPrintPreset, SheetFigureItem, WrongAnswerEntry } from "../../../types";
import { getEntryTitle } from "../../../utils/entry";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { parseQuestionText } from "../../../utils/textLayout";
import type { ExamPrintModel, ExamPrintQuestionModel } from "../types";
import type { ExportScopeMode } from "../../../types";
import type { QuestionBlock } from "../../../utils/textLayout";
import { resolveExamPrintContentOptions } from "./examPrintPresets";
import { buildExamPrintFilenameBase } from "./exportFilename";
import { resolveFigureRepresentation } from "../../figures/services/figureRepresentation";

function figuresForQuestion(entry: WrongAnswerEntry, questionNumber: string): SheetFigureItem[] {
  return (entry.figures ?? []).filter(
    (figure) => normalizeQuestionNumber(figure.questionNumber) === questionNumber,
  );
}

function buildSegments(entry: WrongAnswerEntry, questionNumber: string): ExamPrintQuestionModel["segments"] {
  const stored = entry.questionContentSegments?.[questionNumber];
  if (stored?.length) return stored;
  const block = parseQuestionText(entry.question).find(
    (item): item is QuestionBlock =>
      item.kind === "question" &&
      normalizeQuestionNumber(String(item.displayNumber || item.numberLabel || "")) === questionNumber,
  );
  if (!block) return [{ id: "fallback", type: "text", text: entry.question }];
  const segments: ExamPrintQuestionModel["segments"] = [];
  for (const [index, body] of block.bodySegments.entries()) {
    const id = `body-${index + 1}`;
    const figureToken = body.text.match(/^\s*\[FIGURE:([^\]]+)\]\s*$/i);
    if (figureToken?.[1]) segments.push({ id, type: "figure", figureId: figureToken[1].trim() });
    else if (body.kind === "condition") segments.push({ id, type: "condition", label: body.label, text: body.text });
    else segments.push({ id, type: "text", text: body.text });
  }
  const figures = figuresForQuestion(entry, questionNumber);
  for (const figure of figures.filter((item) => item.placement?.afterSegmentId).sort((a, b) => (a.placement?.order ?? 0) - (b.placement?.order ?? 0))) {
    const after = figure.placement?.afterSegmentId;
    const index = segments.findIndex((segment) => segment.id === after);
    if (index >= 0 && !segments.some((segment) => segment.type === "figure" && segment.figureId === figure.id)) {
      segments.splice(index + 1, 0, { id: `figure-${figure.id}`, type: "figure", figureId: figure.id });
    }
  }
  return segments.length ? segments : [{ id: "body", type: "text", text: block.body }];
}
function scopeLabel(scope: string, count: number): string {
  if (scope === "whole") return "전체";
  if (scope === "wrong") return "오답문항";
  if (scope === "important") return "중요문항";
  if (scope === "marked") return "검토문항";
  if (scope === "selected") return "선택문항";
  if (scope === "current") return "현재문항";
  return `${count}문항`;
}

function applyPreferencesFromPreset(preferences: ExamPrintPreferences, preset: ExamPrintPreset): ExamPrintPreferences {
  const content = resolveExamPrintContentOptions(preset, preferences);
  return {
    ...preferences,
    preset,
    includeAnswerSheet: content.includeBlankAnswerSheet,
    includeSourcePages: content.includeSourcePages,
    layout: content.preferSingleColumn ? "single" : preferences.layout,
    workspaceSize: content.enlargeWorkspace
      ? preferences.workspaceSize === "none"
        ? "normal"
        : preferences.workspaceSize === "small"
          ? "normal"
          : preferences.workspaceSize
      : preferences.workspaceSize,
  };
}

export function buildExamPrintModel(options: {
  entry: WrongAnswerEntry;
  questionNumbers: string[];
  preferences: ExamPrintPreferences;
  preset?: ExamPrintPreset;
  scope?: ExportScopeMode | string;
}): ExamPrintModel {
  const preset = options.preset ?? options.preferences.preset;
  const preferences = applyPreferencesFromPreset(options.preferences, preset);
  const content = resolveExamPrintContentOptions(preset, preferences);
  const blocks = parseQuestionText(options.entry.question).filter((item): item is QuestionBlock => item.kind === "question");
  const scope = (options.scope ?? "whole") as ExportScopeMode;
  const questions: ExamPrintQuestionModel[] = options.questionNumbers.map((questionNumber) => {
    const block = blocks.find((item) => normalizeQuestionNumber(String(item.displayNumber || item.numberLabel || "")) === questionNumber);
    const figures = figuresForQuestion(options.entry, questionNumber).filter((figure) => {
      if (figure.source === "described_only") return Boolean(figure.caption || figure.title);
      return content.includeFigures;
    });
    const visibleFigures = figures.filter((figure) =>
      figure.source === "described_only" || figure.source === "original" || figure.source === "gpt_cleaned" || !figure.source,
    ).map((figure) => {
      const representation = resolveFigureRepresentation(figure, { forPrint: true });
      return {
        ...figure,
        image: representation.image,
        source: representation.kind === "cleaned" ? "gpt_cleaned" as const : representation.kind === "original" ? "original" as const : "described_only" as const,
        resolvedRepresentation: representation.kind,
        needsReview: representation.needsReview,
      };
    });
    const choices = block?.choices.map((choice) => choice.text) ?? [];
    return {
      questionNumber,
      displayNumber: String(block?.displayNumber || block?.numberLabel || questionNumber),
      kind: choices.length > 0 ? "objective" : "subjective",
      choices,
      segments: buildSegments(options.entry, questionNumber),
      figures: visibleFigures,
      workspaceSize: preferences.workspaceSize,
    };
  });
  const label = scopeLabel(scope, questions.length);
  return {
    title: getEntryTitle(options.entry),
    subject: options.entry.subject,
    scopeLabel: label,
    questionCount: questions.length,
    preferences,
    preset,
    questions,
    sourcePageImages: preferences.includeSourcePages ? [...new Set(options.entry.questionImages ?? [])] : [],
    includeHeader: preferences.includeHeader,
    includeAnswerSheet: preferences.includeAnswerSheet && content.includeBlankAnswerSheet,
    includePageNumbers: preferences.includePageNumbers,
    includeSourcePages: preferences.includeSourcePages && content.includeSourcePages,
    extraScratchPages: preferences.extraScratchPages,
    filenameBase: buildExamPrintFilenameBase({
      title: getEntryTitle(options.entry),
      scope,
      questionNumbers: options.questionNumbers,
      kind: "재풀이용",
    }),
    sourceIndex: [],
  };
}
