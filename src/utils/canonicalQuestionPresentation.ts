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
  const rawBody = parseInput.slice(question.start, question.bodyEnd).trim();
  const firstLine = rawBody.split(/\r?\n/, 1)[0].replace(/\s+/g, " ").trim();
  const canonicalText = canonicalSegments
    .filter((segment): segment is Extract<QuestionContentSegment, { type: "text" }> => segment.type === "text")
    .map(segment => segment.text).join(" ").replace(/\s+/g, " ").trim();
  // A stored canonical body can itself begin with "3번". Only remove the
  // parser's source-number range when that range is absent from the body.
  const prefixIsBody = hasQuestionNumber && firstLine && canonicalText.startsWith(firstLine);
  const segments = normalizeQuestionPresentationSegments({
    questionText: prefixIsBody ? rawBody : question.body,
    conditions: [],
    equations: [],
    contentSegments: canonicalSegments,
  });
  const choices = question.choices.map((choice) => `${choice.marker} ${choice.text}`.trim());
  return { segments, choices, parsed: true };
}
