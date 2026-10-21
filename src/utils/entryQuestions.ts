import { resolveEntryQuestionStimulusProjection, type EntryQuestionStimulus } from "./questionStimuli";
import type { ProcessingStatus, QuestionContentSegment, SheetFigureItem, StructuredQuestion, WrongAnswerEntry } from "../types";
import { normalizeQuestionNumber } from "./questionNumber";
import { parseQuestionText, type QuestionBlock } from "./textLayout";
import { isMultipleChoiceQuestion } from "./structuredQuestionType";
import { stripLegacyChoiceSeparator } from "./legacyChoiceSeparator";
import { reconcileEntryQuestions } from "./questionCanonical";
import { normalizeQuestionPresentationSegments } from "./questionPresentation";
import { figureTokenWarning, readFigureTokenReferences, unresolvedFigureTokens } from "./figureTokens";
import { resolveGeneratedWrongAnswerContent } from "./generatedWrongAnswerContent";
import { resolveCanonicalQuestionPresentation } from "./canonicalQuestionPresentation";

export interface ResolvedEntryQuestion {
  /** Stable source identity. Never use position as a persistence key. */
  questionNumber: string;
  /** One-based order within this entry, for navigation only. */
  position: number;
  /** Read-only shared passage projection from the preserved compatibility source. */
  passage?: EntryQuestionStimulus;
  section?: string;
  questionType?: StructuredQuestion["questionType"];
  questionText: string;
  conditions: string[];
  equations: string[];
  choices: string[];
  contentSegments?: QuestionContentSegment[];
  needsReview?: boolean;
  processingStatus?: ProcessingStatus;
  points?: number;
  warning?: string;
  figureIds: string[];
  source?: StructuredQuestion["source"];
}

const EMPTY_MULTIPLE_CHOICE_WARNING = "객관식 문항에 선택지가 없어 검토가 필요합니다.";

function projectStructuredQuestion(question: StructuredQuestion, index: number, figures: SheetFigureItem[] = []): ResolvedEntryQuestion {
  const isEmptyMultipleChoice = isMultipleChoiceQuestion(question.questionType, question.choices)
    && question.choices.length === 0;
  const segments = normalizeQuestionPresentationSegments(question);
  const references = readFigureTokenReferences([
    question.questionText,
    ...question.choices,
    ...segments.flatMap((segment) => segment.type === "text" || segment.type === "condition" ? [segment.text] : segment.type === "figure" ? [`[FIGURE:${segment.figureId}]`] : []),
  ]);
  const tokenWarning = figureTokenWarning(unresolvedFigureTokens(references.map(({ raw }) => raw), figures));
  const warning = [
    isEmptyMultipleChoice ? EMPTY_MULTIPLE_CHOICE_WARNING : undefined,
    question.warning,
    tokenWarning,
  ].filter((value, warningIndex, values) => value && values.indexOf(value) === warningIndex).join(" ") || undefined;
  const referencedIds = references.map(({ id }) => id).filter(Boolean);
  return {
    questionNumber: normalizeQuestionNumber(question.questionNumber) || question.questionNumber,
    position: index + 1,
    section: question.section,
    questionType: question.questionType,
    questionText: question.questionText,
    conditions: [...question.conditions],
    equations: [...question.equations],
    choices: [...question.choices],
    contentSegments: segments,
    needsReview: Boolean(question.needsReview || isEmptyMultipleChoice || tokenWarning),
    processingStatus: question.processingStatus,
    points: question.points,
    warning,
    figureIds: [...new Set([...question.figureIds, ...referencedIds])],
    source: question.source ? structuredClone(question.source) : undefined,
  };
}

function resolveEntryQuestions(entry: Pick<WrongAnswerEntry, "question" | "structuredQuestions" | "questionContentSegments"> & Partial<Pick<WrongAnswerEntry, "answerKey" | "questionMeta" | "figures" | "generatedFromExamSessionId" | "generatedFromQuestionNumber">>): ResolvedEntryQuestion[] {

  const canonical = reconcileEntryQuestions(entry).entry;
  if (canonical.structuredQuestions?.length) {
    const number = normalizeQuestionNumber(canonical.generatedFromQuestionNumber ?? "");
    const matches = canonical.structuredQuestions.filter((question) => normalizeQuestionNumber(question.questionNumber) === number);
    const extras = canonical.structuredQuestions.filter((question) => normalizeQuestionNumber(question.questionNumber) !== number);
    // Earlier versions could persist synthetic recovered source-number blocks.
    // Scope display only when their provenance is demonstrable; keep raw data.
    const recoveredSourceOnly = Boolean(canonical.generatedFromExamSessionId && number && matches.length === 1 && extras.length
      && extras.every((question) => question.needsReview && question.warning === "기존 호환 본문에서 복구된 문항입니다. 원문을 확인하세요."
        && !(canonical.answerKey ?? []).some((answer) => normalizeQuestionNumber(answer.questionNumber) === normalizeQuestionNumber(question.questionNumber))
        && !(canonical.questionMeta ?? []).some((meta) => normalizeQuestionNumber(meta.questionNumber) === normalizeQuestionNumber(question.questionNumber))
        && !Object.keys(canonical.questionContentSegments ?? {}).some((key) => normalizeQuestionNumber(key) === normalizeQuestionNumber(question.questionNumber))));
    const questions = recoveredSourceOnly ? matches : canonical.structuredQuestions;
    return questions.map((question, index) => projectStructuredQuestion({ ...question, choices: question.choices.map(stripLegacyChoiceSeparator) }, index, canonical.figures));
  }

  const generated = canonical.generatedFromExamSessionId ? resolveGeneratedWrongAnswerContent(canonical) : { status: "unavailable" as const };
  if (generated.status === "matched" && canonical.generatedFromQuestionNumber) {
    const presentation = resolveCanonicalQuestionPresentation(canonical.question, generated.segments);
    return [projectStructuredQuestion({ questionNumber: canonical.generatedFromQuestionNumber, questionText: "", conditions: [], equations: [], choices: presentation.choices, contentSegments: presentation.segments, figureIds: presentation.segments.flatMap((segment) => segment.type === "figure" ? [segment.figureId] : []) }, 0, canonical.figures)];
  }

  return parseQuestionText(canonical.question)
    .filter((block): block is QuestionBlock => block.kind === "question")
    .map((block, index) => {
      const number = normalizeQuestionNumber(String(block.numberLabel ?? block.displayNumber ?? index + 1));
      const segmentKeys = Object.keys(canonical.questionContentSegments ?? {}).filter(key => normalizeQuestionNumber(key) === number);
      const segments = number && segmentKeys.length === 1
        ? normalizeQuestionPresentationSegments({ questionText: block.body, conditions: [], equations: [], contentSegments: canonical.questionContentSegments![segmentKeys[0]] })
        : undefined;
      const references = readFigureTokenReferences([
        block.body,
        ...block.choices.map((choice) => choice.text),
        ...segments?.flatMap((segment) => segment.type === "text" || segment.type === "condition" ? [segment.text] : segment.type === "figure" ? [`[FIGURE:${segment.figureId}]`] : []) ?? [],
      ]);
      const tokenWarning = figureTokenWarning(unresolvedFigureTokens(references.map(({ raw }) => raw), canonical.figures ?? []));
      const warning = [tokenWarning, segmentKeys.length > 1 ? "문항 순서 연결이 중복되어 원문을 표시합니다. 연결을 검토해 주세요." : undefined].filter(Boolean).join(" ") || undefined;
      return {
        questionNumber: number || String(index + 1),
        position: index + 1,
        conditions: [],
        equations: [],
        questionText: block.body,
        choices: block.choices.map((choice) => stripLegacyChoiceSeparator(`${choice.marker} ${choice.text}`.trim())),
        contentSegments: segments,
        needsReview: Boolean(warning),
        warning,
        figureIds: [...new Set(references.map(({ id }) => id).filter(Boolean))],
      };
    });
}

export function getEntryQuestions(entry: Parameters<typeof resolveEntryQuestions>[0]): ResolvedEntryQuestion[] {
  const { stimuli, warnings } = resolveEntryQuestionStimulusProjection(entry);
  const questions = resolveEntryQuestions(entry);
  return questions.map(question => {
    const number = normalizeQuestionNumber(question.questionNumber);
    const passage = questions.filter(item => normalizeQuestionNumber(item.questionNumber) === number).length === 1 ? stimuli.get(number) : undefined;
    const warning = [question.warning, warnings.get(number)].filter(Boolean).join(" ") || undefined;
    return { ...question, warning, needsReview: question.needsReview || Boolean(warnings.get(number)),
      ...(passage ? { passage, figureIds: [...new Set([...question.figureIds, ...readFigureTokenReferences([passage.text]).map(item => item.id).filter(Boolean)])] } : {}) };
  });
}

/**
 * Transitional adapter for legacy consumers that still expect QuestionBlock.
 * Structured entries retain their source number in both identity fields; the
 * positional index is deliberately kept only in ResolvedEntryQuestion.position.
 */
export function resolvedQuestionToBlock(question: ResolvedEntryQuestion): QuestionBlock {
  const bodySegments = question.contentSegments
    ?.filter((segment): segment is Extract<QuestionContentSegment, { type: "text" | "condition" | "equation" }> =>
      segment.type === "text" || segment.type === "condition" || segment.type === "equation",
    )
    .map((segment, index) => ({
      kind: segment.type === "condition" ? "condition" as const : "body" as const,
      text: segment.type === "equation" ? segment.latex : segment.text,
      label: segment.type === "condition" ? segment.label : undefined,
      start: index,
      end: index + (segment.type === "equation" ? segment.latex.length : segment.text.length),
    }))
    ?? [{ kind: "body" as const, text: question.questionText, start: 0, end: question.questionText.length }];
  const body = bodySegments.map((segment) => segment.text).filter(Boolean).join("\n") || question.questionText;
  const base = question.position * 100_000;
  return {
    kind: "question",
    numberLabel: question.questionNumber,
    displayNumber: Number(question.questionNumber) || question.position,
    body,
    bodyStart: base,
    bodyEnd: base + body.length,
    start: base,
    end: base + body.length,
    bodySegments: bodySegments.map((segment, index) => ({ ...segment, start: base + index, end: base + index + segment.text.length })),
    choices: question.choices.map((choice, index) => {
      const match = choice.match(/^\s*([①②③④⑤⑥⑦⑧⑨⑩]|\(?\d{1,2}\)?[.)]?)\s*(.*)$/);
      return {
        marker: match?.[1] || String(index + 1),
        text: match?.[2] || choice,
        start: base + body.length + index,
        end: base + body.length + index + choice.length,
      };
    }),
  };
}

export function renderStructuredQuestionsCompatibilityText(questions: StructuredQuestion[]): string {
  return questions.map((question) => {
    const heading = `${question.questionNumber}. ${question.questionText}`.trim();
    const conditions = question.conditions.map((item) => item.trim()).filter(Boolean);
    const equations = question.equations.map((item) => item.trim()).filter(Boolean);
    const choices = question.choices.map((item) => item.trim()).filter(Boolean);
    return [heading, ...conditions, ...equations, ...choices].filter(Boolean).join("\n");
  }).join("\n\n");
}
