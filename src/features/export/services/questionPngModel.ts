import type { QuestionContentSegment, SheetFigureItem } from "../../../types";
import type { ResolvedEntryQuestion } from "../../../utils/entryQuestions";
import { resolveFigureRepresentation } from "../../figures/services/figureRepresentation";

export type QuestionPngScope = "question" | "question_answer" | "question_answer_explanation";

export interface QuestionPngOptions {
  scope: QuestionPngScope;
  background: "white" | "transparent";
  scale: 2 | 3;
  filename: string;
}

export interface QuestionPngCompositionContent {
  question: ResolvedEntryQuestion;
  figures: SheetFigureItem[];
  answer?: string;
  explanation?: string;
  resolveImageUrl(filename: string): Promise<string | null>;
}

export const DEFAULT_QUESTION_PNG_OPTIONS: QuestionPngOptions = { scope: "question", background: "white", scale: 2, filename: "question.png" };
export const QUESTION_PNG_RENDERER_VERSION = "question-render-v3";

export interface QuestionPngPreviewSignature {
  questionNumber: string;
  scope: QuestionPngScope;
  rendererVersion: string;
  fingerprint: string;
}

export interface QuestionExportComposition {
  segments: QuestionContentSegment[];
  placementWarnings: string[];
}

export function buildQuestionExportComposition(question: ResolvedEntryQuestion): QuestionExportComposition {
  const segments = [...(question.contentSegments ?? [])];
  const warnings: string[] = [];
  const values = new Set(segments.flatMap((segment) => segment.type === "text" || segment.type === "condition" ? [segment.text.trim()] : segment.type === "equation" ? [segment.latex.trim()] : []));
  if (!segments.some((segment) => segment.type === "text" && segment.text.trim()) && question.questionText.trim()) {
    segments.unshift({ id: "export-question-text", type: "text", text: question.questionText });
  }
  for (const [index, condition] of question.conditions.entries()) {
    if (condition.trim() && !values.has(condition.trim())) segments.push({ id: `export-condition-${index + 1}`, type: "condition", label: "조건", text: condition });
  }
  for (const [index, equation] of question.equations.entries()) {
    if (equation.trim() && !values.has(equation.trim())) segments.push({ id: `export-equation-${index + 1}`, type: "equation", latex: equation, display: true });
  }
  const linked = new Set(segments.filter((segment): segment is Extract<QuestionContentSegment, { type: "figure" }> => segment.type === "figure").map((segment) => segment.figureId));
  for (const figureId of question.figureIds) {
    if (linked.has(figureId)) continue;
    segments.push({ id: `export-figure-${figureId}`, type: "figure", figureId });
    warnings.push(`그림 ${figureId}의 저장 위치가 없어 export 끝에 배치했습니다.`);
  }
  return { segments, placementWarnings: warnings };
}

export function canonicalQuestionFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `q-${(hash >>> 0).toString(16)}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`; }
  return JSON.stringify(value);
}

export function buildQuestionRenderFingerprint(descriptor: unknown): string { return canonicalQuestionFingerprint(stableJson(descriptor)); }

export function buildQuestionRenderDescriptor(input: { question: ResolvedEntryQuestion; figures: SheetFigureItem[]; answer?: string; explanation?: string; scope: QuestionPngScope }): unknown {
  return {
    rendererVersion: QUESTION_PNG_RENDERER_VERSION,
    scope: input.scope,
    question: { questionNumber: input.question.questionNumber, questionText: input.question.questionText, conditions: input.question.conditions, equations: input.question.equations, choices: input.question.choices, contentSegments: input.question.contentSegments },
    figures: input.figures.map((figure) => { const selected = resolveFigureRepresentation(figure, { forPrint: true }); return { id: figure.id, representation: selected.kind, asset: selected.image, original: figure.original?.image, cleaned: figure.cleaned?.image, semanticSpec: figure.semanticSpec }; }),
    answer: input.scope === "question" ? undefined : input.answer,
    explanation: input.scope === "question_answer_explanation" ? input.explanation : undefined,
  };
}

export function downloadQuestionPng(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
