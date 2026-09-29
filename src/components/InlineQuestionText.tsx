import { Fragment, useEffect, useState, type ReactNode } from "react";
import type { SheetFigureItem } from "../types";
import { getImageUrl } from "../api";
import { resolveFigureRepresentation } from "../features/figures/services/figureRepresentation";
import MathText from "./MathText";

const FIGURE_TOKEN = /\[FIGURE(?::([^\]]*))?(?:\]|$)/gi;

function InlineFigure({ figure, id }: { figure?: SheetFigureItem; id: string }) {
  const representation = figure ? resolveFigureRepresentation(figure) : undefined;
  const filename = representation?.image;
  const [result, setResult] = useState<{ filename: string; url?: string; failed: boolean }>();

  useEffect(() => {
    let active = true;
    if (!filename) return () => { active = false; };
    void getImageUrl(filename).then((url) => { if (active) setResult({ filename, url, failed: false }); }).catch(() => { if (active) setResult({ filename, failed: true }); });
    return () => { active = false; };
  }, [filename]);

  const url = filename && result?.filename === filename ? result.url : undefined;
  if (url) return <img className="question-inline-figure" src={url} alt={figure?.title || "문항 그림"} />;
  if (figure && !filename) return <span className="question-inline-figure-warning" role="note">[그림 설명 확인: {figure.caption || figure.title || id}]</span>;
  if (filename && result?.filename === filename && result.failed) return <span className="question-inline-figure-warning" role="note">[그림을 불러오지 못했습니다: {id}]</span>;
  return <span className="question-inline-figure-warning" role="note">[그림 연결 확인 필요: {id}]</span>;
}

/** Renders imported figure markers in place without exposing the internal token. */
export default function InlineQuestionText({ text, figures = [], renderText }: {
  text: string;
  figures?: SheetFigureItem[];
  renderText?: (text: string, offset: number) => ReactNode;
}) {
  const byId = new Map(figures.map((figure) => [figure.id, figure]));
  const parts: Array<{ text: string; start: number } | { id: string | undefined; start: number }> = [];
  let cursor = 0;
  for (const match of text.matchAll(FIGURE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: text.slice(cursor, index), start: cursor });
    const id = match[1]?.trim();
    parts.push({ id, start: index });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), start: cursor });
  return <>{parts.map((part, index) => "id" in part
    ? part.id
      ? <span key={`${part.id}-${index}`} className="question-inline-figure-slot"><InlineFigure id={part.id} figure={byId.get(part.id)} /></span>
      : <span key={`missing-${index}`} className="question-inline-figure-warning" role="note">[그림 ID 확인 필요]</span>
    : <Fragment key={`text-${index}`}>{renderText ? renderText(part.text, part.start) : <MathText text={part.text} />}</Fragment>)}</>;
}
