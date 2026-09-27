import type { SheetFigureItem } from "../types";

export interface FigureTokenReference {
  id: string;
  raw: string;
}

export function readFigureTokenReferences(values: Array<string | undefined>): FigureTokenReference[] {
  const references: FigureTokenReference[] = [];
  for (const value of values) {
    if (!value) continue;
    for (const match of value.matchAll(/\[FIGURE(?::([^\]]*))?(?:\]|$)/gi)) {
      references.push({ id: match[1]?.trim() ?? "", raw: match[0] });
    }
  }
  return references;
}

export function unresolvedFigureTokens(values: Array<string | undefined>, figures: SheetFigureItem[] = []): FigureTokenReference[] {
  const references = readFigureTokenReferences(values);
  return references.filter(({ id }) => !id || figures.filter((figure) => figure.id === id).length !== 1);
}

export function figureTokenWarning(references: FigureTokenReference[]): string | undefined {
  if (!references.length) return undefined;
  return references.some(({ id }) => !id)
    ? "문항에 그림 ID가 비어 있는 표식이 있어 원문 확인이 필요합니다."
    : "문항의 그림 표식 위치 또는 연결을 확인해 주세요.";
}
