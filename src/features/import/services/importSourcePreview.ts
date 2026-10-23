import type { EntryFormData, StructuredQuestion } from "../../../types";
import { normalizeImportImageKey } from "../../../utils/importImageReferences";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

/** Select explicit original assets only. Number aliases never resolve to the first match. */
export function importSourcePreview(question: StructuredQuestion, draft: Partial<EntryFormData>) {
  const pages = draft.sourcePageImages ?? [];
  const number = normalizeQuestionNumber(question.questionNumber);
  const uniqueNumber = (draft.structuredQuestions ?? []).filter(item => normalizeQuestionNumber(item.questionNumber) === number).length === 1;
  const figures = draft.figures ?? [];
  const figureCounts = new Map<string, number>();
  figures.forEach(figure => figureCounts.set(figure.id, (figureCounts.get(figure.id) ?? 0) + 1));
  const linkedFigures = figures.filter(figure =>
    figureCounts.get(figure.id) === 1 &&
    (question.figureIds.includes(figure.id) || (uniqueNumber && normalizeQuestionNumber(figure.questionNumber) === number)),
  );
  const images: string[] = [];
  const page = question.source?.page;
  if (typeof page === "number" && Number.isInteger(page) && page > 0 && page <= pages.length) images.push(pages[page - 1]);
  const reference = question.source?.reference;
  const available = [...new Set([...pages, ...(draft.questionImages ?? [])])];
  const exact = reference ? available.filter(image => image === reference) : [];
  const matches = exact.length ? exact : reference ? available.filter(image => normalizeImportImageKey(image) === normalizeImportImageKey(reference)) : [];
  if (matches.length === 1) images.push(matches[0]);
  linkedFigures.forEach(figure => {
    if (figure.original?.sourcePageImage) images.push(figure.original.sourcePageImage);
    const original = figure.original?.image ?? (figure.source === "original" && figure.image !== figure.cleaned?.image ? figure.image : undefined);
    if (original) images.push(original);
  });
  return { images: [...new Set(images)], ambiguous: !uniqueNumber || matches.length > 1 };
}
