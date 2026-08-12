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
