import type { QuestionContentSegment } from "../types";
import { parseQuestionText } from "./textLayout";
import { normalizeQuestionPresentationSegments } from "./questionPresentation";

export function resolveCanonicalQuestionPresentation(questionText: string, canonicalSegments: QuestionContentSegment[]) {
  const hasQuestionNumber = /^\s*(?:\[\s*)?(?:문제\s*\d+|#\d+|\d{1,3}[.)]|\d{1,3}번)/.test(questionText);
  const parseInput = hasQuestionNumber ? questionText : `1. ${questionText}`;
  const blocks = parseQuestionText(parseInput);
  const questions = blocks.filter((block) => block.kind === "question");
  if (questions.length !== 1) {
    return {
      segments: normalizeQuestionPresentationSegments({ questionText, conditions: [], equations: [], contentSegments: canonicalSegments }),
      choices: [] as string[],
      parsed: false,
    };
  }
  const question = questions[0];
  const segments = normalizeQuestionPresentationSegments({
    questionText: question.body,
    conditions: [],
    equations: [],
    contentSegments: canonicalSegments,
  });
  const choices = question.choices.map((choice) => `${choice.marker} ${choice.text}`.trim());
  return { segments, choices, parsed: true };
}
