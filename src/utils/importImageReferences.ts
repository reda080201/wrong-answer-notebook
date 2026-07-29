import type { EntryFormData, SheetFigureItem } from "../types";

export function normalizeImportImageKey(name: string): string {
  const basename = name.split(/[\\/]/).pop()?.trim() ?? name.trim();
  return basename.normalize("NFKC").toLocaleLowerCase("en-US");
}

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
    ...(entry.supplementalResources ?? []).flatMap((resource) => resource.images ?? []),
  ].filter((value): value is string => Boolean(value?.trim()));
}

export function mapFigureImageReferences(
  figure: SheetFigureItem,
  mapImage: (filename: string) => string | undefined,
  removeUnmapped = false,
): SheetFigureItem {
  const map = (filename: string | undefined) => {
    if (!filename) return undefined;
    const mapped = mapImage(filename);
    return mapped ?? (removeUnmapped ? undefined : filename);
  };
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
  options: { removeUnmapped?: boolean } = {},
): Partial<EntryFormData> {
  const removeUnmapped = options.removeUnmapped ?? false;
  const map = (filename: string) => {
    const mapped = mapImage(filename);
    return mapped ?? (removeUnmapped ? undefined : filename);
  };
  return {
    ...entry,
    questionImages: (entry.questionImages ?? []).map(map).filter((image): image is string => Boolean(image)),
    sourcePageImages: (entry.sourcePageImages ?? []).map(map).filter((image): image is string => Boolean(image)),
    explanationParts: (entry.explanationParts ?? []).map((part) => ({
      ...part,
      images: (part.images ?? []).map(map).filter((image): image is string => Boolean(image)),
    })),
    figures: (entry.figures ?? []).map((figure) => mapFigureImageReferences(figure, mapImage, removeUnmapped)),
    learningBlocks: (entry.learningBlocks ?? []).map((block) => ({
      ...block,
      images: (block.images ?? []).map(map).filter((image): image is string => Boolean(image)),
    })),
    supplementalResources: (entry.supplementalResources ?? []).map((resource) => ({
      ...resource,
      images: (resource.images ?? []).map(map).filter((image): image is string => Boolean(image)),
    })),
  };
}
