import type {
  EntryFormData,
  QuestionContentSegment,
  StructuredQuestion,
} from "../../../types";
import type { ImportValidationIssue } from "../../../utils/importValidation";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { renderStructuredQuestionsCompatibilityText } from "../../../utils/entryQuestions";

const REVIEW_MARKERS = {
  question: "@@QUESTION",
  endQuestion: "@@END_QUESTION",
  text: "@@TEXT",
  endText: "@@END_TEXT",
  conditions: "@@CONDITIONS",
  endConditions: "@@END_CONDITIONS",
  equations: "@@EQUATIONS",
  endEquations: "@@END_EQUATIONS",
  choices: "@@CHOICES",
  endChoices: "@@END_CHOICES",
  item: "@@ITEM",
  endItem: "@@END_ITEM",
} as const;

export interface StructuredQuestionReviewDocument {
  questionNumber: string;
  questionText: string;
  conditions: string[];
  equations: string[];
  choices: string[];
}

export interface StructuredQuestionReviewParseResult {
  documents?: StructuredQuestionReviewDocument[];
  error?: string;
}

function trimDocumentValue(lines: string[]): string {
  return lines
    .map((line) => line.replace(/^\\(?=\\*@@)/, ""))
    .join("\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();
}

function renderDocumentValue(value: string): string[] {
  return value.split("\n").map((line) => /^\\*@@/.test(line) ? `\\${line}` : line);
}

function parseReviewItems(
  lines: string[],
  start: number,
  endMarker: string,
  sectionName: string,
): { values?: string[]; nextIndex?: number; error?: string } {
  const values: string[] = [];
  let index = start;
  while (index < lines.length && lines[index] !== endMarker) {
    if (lines[index] !== REVIEW_MARKERS.item) {
      return { error: `${sectionName} 영역의 구분자가 손상되었습니다.` };
    }
    index += 1;
    const itemLines: string[] = [];
    while (index < lines.length && lines[index] !== REVIEW_MARKERS.endItem) {
      if (lines[index].startsWith("@@")) {
        return { error: `${sectionName} 항목의 종료 구분자가 손상되었습니다.` };
      }
      itemLines.push(lines[index]);
      index += 1;
    }
    if (index >= lines.length) return { error: `${sectionName} 항목이 닫히지 않았습니다.` };
    const value = trimDocumentValue(itemLines);
    if (!value) return { error: `${sectionName} 항목은 비어 있을 수 없습니다.` };
    values.push(value);
    index += 1;
  }
  if (index >= lines.length) return { error: `${sectionName} 영역이 닫히지 않았습니다.` };
  return { values, nextIndex: index + 1 };
}

export function renderStructuredQuestionsReviewText(questions: StructuredQuestion[]): string {
  return questions.map((question) => [
    `${REVIEW_MARKERS.question} ${question.questionNumber}`,
    REVIEW_MARKERS.text,
    ...renderDocumentValue(question.questionText),
    REVIEW_MARKERS.endText,
    REVIEW_MARKERS.conditions,
    ...question.conditions.flatMap((condition) => [REVIEW_MARKERS.item, ...renderDocumentValue(condition), REVIEW_MARKERS.endItem]),
    REVIEW_MARKERS.endConditions,
    REVIEW_MARKERS.equations,
    ...question.equations.flatMap((equation) => [REVIEW_MARKERS.item, ...renderDocumentValue(equation), REVIEW_MARKERS.endItem]),
    REVIEW_MARKERS.endEquations,
    REVIEW_MARKERS.choices,
    ...question.choices.flatMap((choice) => [REVIEW_MARKERS.item, ...renderDocumentValue(choice), REVIEW_MARKERS.endItem]),
    REVIEW_MARKERS.endChoices,
    REVIEW_MARKERS.endQuestion,
  ].join("\n")).join("\n\n");
}

export function parseStructuredQuestionsReviewText(text: string): StructuredQuestionReviewParseResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const documents: StructuredQuestionReviewDocument[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }
    const questionMatch = lines[index].match(/^@@QUESTION\s+(.+)$/);
    if (!questionMatch) return { error: "문항 시작 구분자가 손상되었거나 누락되었습니다." };
    const questionNumber = normalizeQuestionNumber(questionMatch[1]);
    if (!questionNumber) return { error: "문항 번호가 올바르지 않습니다." };
    index += 1;

    if (lines[index] !== REVIEW_MARKERS.text) return { error: `${questionNumber}번 본문 구분자가 손상되었습니다.` };
    index += 1;
    const textLines: string[] = [];
    while (index < lines.length && lines[index] !== REVIEW_MARKERS.endText) {
      if (lines[index].startsWith("@@")) return { error: `${questionNumber}번 본문 종료 구분자가 손상되었습니다.` };
      textLines.push(lines[index]);
      index += 1;
    }
    if (index >= lines.length) return { error: `${questionNumber}번 본문이 닫히지 않았습니다.` };
    const questionText = trimDocumentValue(textLines);
    if (!questionText) return { error: `${questionNumber}번 본문은 비어 있을 수 없습니다.` };
    index += 1;

    if (lines[index] !== REVIEW_MARKERS.conditions) return { error: `${questionNumber}번 조건 구분자가 손상되었습니다.` };
    const conditions = parseReviewItems(lines, index + 1, REVIEW_MARKERS.endConditions, "조건");
    if (conditions.error) return { error: conditions.error };
    index = conditions.nextIndex!;

    if (lines[index] !== REVIEW_MARKERS.equations) return { error: `${questionNumber}번 수식 구분자가 손상되었습니다.` };
    const equations = parseReviewItems(lines, index + 1, REVIEW_MARKERS.endEquations, "수식");
    if (equations.error) return { error: equations.error };
    index = equations.nextIndex!;

    if (lines[index] !== REVIEW_MARKERS.choices) return { error: `${questionNumber}번 선택지 구분자가 손상되었습니다.` };
    const choices = parseReviewItems(lines, index + 1, REVIEW_MARKERS.endChoices, "선택지");
    if (choices.error) return { error: choices.error };
    index = choices.nextIndex!;
    if (lines[index] !== REVIEW_MARKERS.endQuestion) return { error: `${questionNumber}번 문항 종료 구분자가 손상되었습니다.` };
    index += 1;
    documents.push({ questionNumber, questionText, conditions: conditions.values!, equations: equations.values!, choices: choices.values! });
  }

  if (!documents.length) return { error: "검토할 구조화 문항이 없습니다." };
  const numbers = documents.map((document) => document.questionNumber);
  if (new Set(numbers).size !== numbers.length) return { error: "문항 번호를 중복해서 사용할 수 없습니다." };
  return { documents };
}

function cloneSegment(segment: QuestionContentSegment): QuestionContentSegment {
  return segment.type === "table" ? { ...segment, rows: segment.rows.map((row) => [...row]) } : { ...segment };
}

function updateSemanticSegments(question: StructuredQuestion, document: StructuredQuestionReviewDocument): QuestionContentSegment[] {
  const desired: QuestionContentSegment[] = [
    { id: "", type: "text", text: document.questionText },
    ...document.conditions.map((text) => ({ id: "", type: "condition" as const, text })),
    ...document.equations.map((latex) => ({ id: "", type: "equation" as const, latex, display: true })),
  ];
  const remaining = new Map<QuestionContentSegment["type"], QuestionContentSegment[]>();
  for (const type of ["text", "condition", "equation"] as const) {
    remaining.set(type, question.contentSegments.filter((segment) => segment.type === type).map(cloneSegment));
  }
  let generated = 0;
  const take = (type: "text" | "condition" | "equation", value: QuestionContentSegment) => {
    const existing = remaining.get(type)?.shift();
    if (existing) return { ...value, id: existing.id, ...(existing.type === "equation" && value.type === "equation" ? { display: existing.display } : {}) } as QuestionContentSegment;
    generated += 1;
    return { ...value, id: `review-${question.questionNumber}-${type}-${generated}` } as QuestionContentSegment;
  };
  const byType = new Map<string, QuestionContentSegment[]>();
  for (const item of desired) {
    const list = byType.get(item.type) ?? [];
    list.push(item);
    byType.set(item.type, list);
  }
  const result = question.contentSegments
    .map((segment) => {
      if (segment.type === "figure" || segment.type === "table") return cloneSegment(segment);
      const item = byType.get(segment.type)?.shift();
      return item ? take(segment.type, item) : null;
    })
    .filter((segment): segment is QuestionContentSegment => Boolean(segment))
    ;
  const additions = (["text", "condition", "equation"] as const)
    .flatMap((type) => (byType.get(type) ?? []).map((item) => take(type, item)));
  const firstStructuralIndex = result.findIndex((segment) => segment.type === "figure" || segment.type === "table");
  if (firstStructuralIndex < 0) result.push(...additions);
  else result.splice(firstStructuralIndex, 0, ...additions);
  return result;
}

export function mergeStructuredReviewTextIntoQuestions(
  questions: StructuredQuestion[],
  text: string,
): StructuredQuestionMergeResult {
  const parsed = parseStructuredQuestionsReviewText(text);
  if (!parsed.documents) return { error: parsed.error };
  const canonicalNumbers = questions.map((question) => normalizeQuestionNumber(question.questionNumber));
  const actualNumbers = parsed.documents.map((document) => document.questionNumber);
  const expected = [...canonicalNumbers].sort();
  const actual = [...actualNumbers].sort();
  if (expected.length !== actual.length || expected.some((number, index) => number !== actual[index])) {
    return { error: "구조화된 문항의 번호를 추가하거나 삭제할 수 없습니다." };
  }
  const byNumber = new Map(parsed.documents.map((document) => [document.questionNumber, document]));
  return {
    questions: questions.map((question) => {
      const document = byNumber.get(normalizeQuestionNumber(question.questionNumber));
      if (!document) return question;
      return {
        ...question,
        questionText: document.questionText,
        conditions: [...document.conditions],
        equations: [...document.equations],
        choices: [...document.choices],
        contentSegments: updateSemanticSegments(question, document),
        figureIds: [...question.figureIds],
        source: question.source ? { ...question.source } : undefined,
      };
    }),
  };
}

export interface StructuredQuestionMergeResult {
  questions?: StructuredQuestion[];
  error?: string;
}

export function removeFigureFromImportDraft(
  draft: Partial<EntryFormData>,
  figureId: string,
): Partial<EntryFormData> {
  const strip = (segments: QuestionContentSegment[]) => segments
    .filter((segment) => segment.type !== "figure" || segment.figureId !== figureId)
    .map((segment) => segment.type === "table"
      ? { ...segment, rows: segment.rows.map((row) => [...row]) }
      : { ...segment });
  const structuredQuestions = draft.structuredQuestions?.map((question) => ({
    ...question,
    figureIds: question.figureIds.filter((id) => id !== figureId),
    contentSegments: strip(question.contentSegments),
    source: question.source ? { ...question.source } : undefined,
  }));
  const questionContentSegments = draft.questionContentSegments
    ? Object.fromEntries(Object.entries(draft.questionContentSegments).map(([number, segments]) => [number, strip(segments)]))
    : undefined;

  return {
    ...draft,
    figures: (draft.figures ?? []).filter((figure) => figure.id !== figureId),
    structuredQuestions,
    questionContentSegments,
    question: structuredQuestions?.length
      ? renderStructuredQuestionsCompatibilityText(structuredQuestions)
      : draft.question,
  };
}

export function getStructuredValidationFingerprint(issues: ImportValidationIssue[]): string {
  return issues
    .map((issue) => `${issue.id}\u0000${issue.severity}\u0000${issue.message}`)
    .sort()
    .join("\u0001");
}
