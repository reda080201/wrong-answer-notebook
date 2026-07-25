import type { EntryFormData, SheetFigureItem } from "../types";

export function collectFigureImageReferences(figure: SheetFigureItem): string[] {
  return [
    figure.image,
    figure.original?.image,
    figure.original?.sourcePageImage,
    figure.cleaned?.image,
  ].filter((value): value is string => Boolean(value?.trim()));
}

export function collectEntryImportImageReferences(entry: Partial<EntryFormData>): string[] {
  return [
    ...(entry.questionImages ?? []),
    ...(entry.figures ?? []).flatMap(collectFigureImageReferences),
    ...(entry.explanationParts ?? []).flatMap((part) => part.images ?? []),
  ].filter((value): value is string => Boolean(value?.trim()));
}

export function mapFigureImageReferences(
  figure: SheetFigureItem,
  mapImage: (filename: string) => string | undefined,
): SheetFigureItem {
  const map = (filename: string | undefined) => filename ? mapImage(filename) ?? filename : undefined;
  return {
    ...figure,
    image: map(figure.image),
    original: figure.original
      ? { ...figure.original, image: map(figure.original.image) ?? figure.original.image, sourcePageImage: map(figure.original.sourcePageImage) }
      : undefined,
    cleaned: figure.cleaned
      ? { ...figure.cleaned, image: map(figure.cleaned.image) ?? figure.cleaned.image }
      : undefined,
  };
}

export function mapEntryImportImageReferences(
  entry: Partial<EntryFormData>,
  mapImage: (filename: string) => string | undefined,
): Partial<EntryFormData> {
  return {
    ...entry,
    questionImages: (entry.questionImages ?? []).map((image) => mapImage(image) ?? image),
    explanationParts: (entry.explanationParts ?? []).map((part) => ({
      ...part,
      images: (part.images ?? []).map((image) => mapImage(image) ?? image),
    })),
    figures: (entry.figures ?? []).map((figure) => mapFigureImageReferences(figure, mapImage)),
  };
}
