import type { SheetFigureItem, WrongAnswerEntry } from "../types";
import { normalizeQuestionNumber } from "./questionNumber";

export interface QuestionAssetProjection {
  figures: SheetFigureItem[];
  questionImages: string[];
  sourcePageImages: string[];
}

interface QuestionAssetTarget {
  questionNumber: string;
  /** Presence is meaningful: an empty canonical list means no figures are linked. */
  figureIds?: string[];
  sourcePage?: number;
}

/** Resolves only assets belonging to the canonical question identity. */
export function resolveQuestionAssets(entry: WrongAnswerEntry, question: QuestionAssetTarget): QuestionAssetProjection {
  const normalizedNumber = normalizeQuestionNumber(question.questionNumber);
  const figures = question.figureIds
    ? (entry.figures ?? []).filter((figure) => question.figureIds?.includes(figure.id))
    : (entry.figures ?? []).filter((figure) => normalizeQuestionNumber(figure.questionNumber) === normalizedNumber);
  const crops = (entry.questionSourceCrops ?? [])
    .filter((crop) => normalizeQuestionNumber(crop.questionNumber) === normalizedNumber)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  const sourcePages = question.sourcePage
    ? (entry.sourcePageImages ?? []).slice(question.sourcePage - 1, question.sourcePage)
    : [...new Set(crops.map((crop) => crop.sourcePageImage).filter((image): image is string => Boolean(image)))];
  return {
    figures,
    questionImages: crops.map((crop) => crop.image),
    sourcePageImages: sourcePages,
  };
}

