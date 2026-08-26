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
  const figures = (entry.figures ?? []).filter((figure) =>
    question.figureIds.includes(figure.id) || normalizeQuestionNumber(figure.questionNumber) === number,
  );
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
