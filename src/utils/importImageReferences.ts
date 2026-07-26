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
    ...(entry.sourcePageImages ?? []),
    ...(entry.figures ?? []).flatMap(collectFigureImageReferences),
    ...(entry.explanationParts ?? []).flatMap((part) => part.images ?? []),
    ...(entry.learningBlocks ?? []).flatMap((block) => block.images ?? []),
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
      ? (() => {
          const image = map(figure.original.image);
          const sourcePageImage = map(figure.original.sourcePageImage);
          return image ? { ...figure.original, image, sourcePageImage } : undefined;
        })()
      : undefined,
    cleaned: figure.cleaned
      ? (() => {
          const image = map(figure.cleaned.image);
          return image ? { ...figure.cleaned, image } : undefined;
        })()
      : undefined,
  };
}

export function mapEntryImportImageReferences(
  entry: Partial<EntryFormData>,
  mapImage: (filename: string) => string | undefined,
): Partial<EntryFormData> {
  return {
    ...entry,
    questionImages: (entry.questionImages ?? []).map(mapImage).filter((image): image is string => Boolean(image)),
    sourcePageImages: (entry.sourcePageImages ?? []).map(mapImage).filter((image): image is string => Boolean(image)),
    explanationParts: (entry.explanationParts ?? []).map((part) => ({
      ...part,
      images: (part.images ?? []).map(mapImage).filter((image): image is string => Boolean(image)),
    })),
    figures: (entry.figures ?? []).map((figure) => mapFigureImageReferences(figure, mapImage)),
    learningBlocks: (entry.learningBlocks ?? []).map((block) => ({
      ...block,
      images: (block.images ?? []).map(mapImage).filter((image): image is string => Boolean(image)),
    })),
  };
}
