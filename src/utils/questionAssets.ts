import type { ResolvedEntryQuestion } from "./entryQuestions";
import { normalizeQuestionNumber } from "./questionNumber";
import type { WrongAnswerEntry } from "../types";

export interface QuestionAssetProjection {
  sourceCrops: NonNullable<WrongAnswerEntry["questionSourceCrops"]>;
  sourcePages: string[];
  figureAssets: string[];
}

const unique = (values: Array<string | undefined>) => [
  ...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim())),
];

/** Canonical figure IDs win; question-number matching is legacy-only. */
export function resolveQuestionFigures(
  entry: Pick<WrongAnswerEntry, "figures" | "structuredQuestions">,
  question: Pick<ResolvedEntryQuestion, "questionNumber" | "figureIds">,
) {
  const number = normalizeQuestionNumber(question.questionNumber);
  const hasCanonicalQuestion = Boolean(entry.structuredQuestions?.some((item) => normalizeQuestionNumber(item.questionNumber) === number));
  const ids = new Set(question.figureIds);
  return (entry.figures ?? []).filter((figure) => {
    if (hasCanonicalQuestion || question.figureIds.length > 0) return ids.has(figure.id);
    return normalizeQuestionNumber(figure.questionNumber) === number;
  });
}

/** Returns only assets explicitly associated with this canonical question. */
export function resolveQuestionAssets(
  entry: WrongAnswerEntry,
  question: Pick<ResolvedEntryQuestion, "questionNumber" | "figureIds" | "source">,
): QuestionAssetProjection {
  const number = normalizeQuestionNumber(question.questionNumber);
  const sourceCrops = (entry.questionSourceCrops ?? [])
    .filter((crop) => normalizeQuestionNumber(crop.questionNumber) === number)
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  const figures = resolveQuestionFigures(entry, question);
  const exactSourcePages = [
    ...sourceCrops.map((crop) => crop.sourcePageImage),
    ...figures.map((figure) => figure.original?.sourcePageImage),
  ];
  if (question.source?.page && entry.sourcePageImages?.[question.source.page - 1]) {
    exactSourcePages.push(entry.sourcePageImages[question.source.page - 1]);
  }
  const isLegacySingleQuestion = !entry.structuredQuestions?.length && number === "1";
  return {
    sourceCrops,
    sourcePages: unique(isLegacySingleQuestion && exactSourcePages.length === 0
      ? entry.sourcePageImages ?? []
      : exactSourcePages),
    figureAssets: unique(figures.flatMap((figure) => [
      figure.image,
      figure.original?.image,
      figure.cleaned?.image,
    ])),
  };
}
