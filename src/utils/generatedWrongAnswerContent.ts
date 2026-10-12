import type { QuestionContentSegment } from "../types";
import { normalizeQuestionNumber } from "./questionNumber";

export type GeneratedWrongAnswerContent =
  | { status: "matched"; key: string; segments: QuestionContentSegment[] }
  | { status: "ambiguous" }
  | { status: "unavailable" };

export function resolveGeneratedWrongAnswerContent(input: {
  generatedFromQuestionNumber?: string;
  questionContentSegments?: Record<string, QuestionContentSegment[]>;
}): GeneratedWrongAnswerContent {
  const all = input.questionContentSegments ?? {};
  const keys = Object.keys(all).filter((key) => key.trim());
  if (!input.generatedFromQuestionNumber || keys.length === 0) return { status: "unavailable" };
  if (Object.prototype.hasOwnProperty.call(all, input.generatedFromQuestionNumber) && all[input.generatedFromQuestionNumber]?.length) {
    return { status: "matched", key: input.generatedFromQuestionNumber, segments: all[input.generatedFromQuestionNumber] };
  }
  const expected = normalizeQuestionNumber(input.generatedFromQuestionNumber);
  const matches = keys.filter((key) => normalizeQuestionNumber(key) === expected && all[key]?.length);
  if (matches.length === 1) return { status: "matched", key: matches[0], segments: all[matches[0]] };
  if (matches.length > 1) return { status: "ambiguous" };
  if (keys.length === 1 && all[keys[0]]?.length) return { status: "matched", key: keys[0], segments: all[keys[0]] };
  return keys.length > 1 ? { status: "ambiguous" } : { status: "unavailable" };
}
