import type { QuestionContentSegment, StructuredQuestion, WrongAnswerEntry } from "../types";
import { normalizeQuestionNumber } from "./questionMeta";
import { parseQuestionText, type QuestionBlock } from "./textLayout";

export interface ResolvedEntryQuestion {
  questionNumber: string;
  questionText: string;
  choices: string[];
  contentSegments?: QuestionContentSegment[];
  points?: number;
  warning?: string;
  figureIds: string[];
  source?: StructuredQuestion["source"];
}

function cloneSegments(segments: QuestionContentSegment[]): QuestionContentSegment[] {
  return segments.map((segment) => {
    if (segment.type === "table") return { ...segment, rows: segment.rows.map((row) => [...row]) };
    return { ...segment };
  });
}

export function getEntryQuestions(entry: Pick<WrongAnswerEntry, "question" | "structuredQuestions" | "questionContentSegments">): ResolvedEntryQuestion[] {
  if (entry.structuredQuestions?.length) {
    return entry.structuredQuestions.map((question) => ({
      questionNumber: normalizeQuestionNumber(question.questionNumber) || question.questionNumber,
      questionText: question.questionText,
      choices: [...question.choices],
      contentSegments: cloneSegments(question.contentSegments),
      points: question.points,
      warning: question.warning,
      figureIds: [...question.figureIds],
      source: question.source ? { ...question.source } : undefined,
    }));
  }

  return parseQuestionText(entry.question)
    .filter((block): block is QuestionBlock => block.kind === "question")
    .map((block, index) => {
      const number = normalizeQuestionNumber(String(block.numberLabel ?? block.displayNumber ?? index + 1));
      return {
        questionNumber: number || String(index + 1),
        questionText: block.body,
        choices: block.choices.map((choice) => `${choice.marker} ${choice.text}`.trim()),
        contentSegments: number ? entry.questionContentSegments?.[number] : undefined,
        figureIds: [],
      };
    });
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

/**
 * Keeps the editable compatibility text and v2's canonical questions in
 * lockstep. Figure/table segments keep their identity and relative order;
 * textual segments are rebuilt from the reviewed prose.
 */
export function applyCompatibilityTextToStructuredQuestions(
  questions: StructuredQuestion[],
  text: string,
): StructuredQuestion[] | null {
  const parsed = parseQuestionText(text).filter((block): block is QuestionBlock => block.kind === "question");
  const byNumber = new Map(parsed.map((block) => [normalizeQuestionNumber(block.numberLabel), block]));
  if (parsed.length !== questions.length || questions.some((question) => !byNumber.has(normalizeQuestionNumber(question.questionNumber)))) {
    return null;
  }

  return questions.map((question) => {
    const block = byNumber.get(normalizeQuestionNumber(question.questionNumber));
    if (!block) return question;
    const bodySegments: QuestionContentSegment[] = block.bodySegments.map((segment, index) => {
      const id = question.contentSegments.filter((item) => item.type !== "figure" && item.type !== "table")[index]?.id
        ?? `review-${question.questionNumber}-${index + 1}`;
      return segment.kind === "condition"
        ? { id, type: "condition", label: segment.label, text: segment.text }
        : { id, type: "text", text: segment.text };
    });
    let nextBodySegment = 0;
    const contentSegments: QuestionContentSegment[] = [];
    for (const segment of question.contentSegments) {
      if (segment.type === "figure" || segment.type === "table") {
        contentSegments.push(segment);
        continue;
      }
      const next = bodySegments[nextBodySegment++];
      if (next) contentSegments.push({ ...next, id: segment.id });
    }
    contentSegments.push(...bodySegments.slice(nextBodySegment));
    return {
      ...question,
      questionText: block.body,
      conditions: block.bodySegments.filter((segment) => segment.kind === "condition").map((segment) => segment.text),
      choices: block.choices.map((choice) => `${choice.marker} ${choice.text}`.trim()),
      contentSegments,
    };
  });
}
