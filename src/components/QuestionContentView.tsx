import type { QuestionContentSegment, SheetFigureItem } from "../types";
import MathText from "./MathText";
import ZoomableImageViewer from "./ZoomableImageViewer";
import SemanticFigureView from "../features/figures/components/SemanticFigureView";
import { resolveFigureRepresentation } from "../features/figures/services/figureRepresentation";
import InlineQuestionText from "./InlineQuestionText";
import { renderAnnotatedText } from "../utils/annotations";
import type { TextRangeAnnotation } from "../types";
import QuestionChoiceList from "./QuestionChoiceList";
import { tokenizeMathForDisplay } from "./MathText";

function renderCanonicalAnnotatedText(text: string, offset: number, ranges: Array<{ id: string; start: number; end: number; tool: TextRangeAnnotation["tool"] }>) {
  let cursor = 0;
  return tokenizeMathForDisplay(text).map((token, index) => {
    const length = token.type === "text" ? token.value.length : token.raw.length;
    const start = offset + cursor;
    const end = start + length;
    cursor += length;
    const annotations = ranges.filter((annotation) => annotation.end > start && annotation.start < end);
    const common = { "data-canonical-raw-start": start, "data-canonical-raw-end": end };
    if (token.type === "text") {
      const local = annotations.map((annotation) => ({
        id: annotation.id,
        target: "question" as const,
        kind: "text" as const,
        start: Math.max(0, annotation.start - start),
        end: Math.min(length, annotation.end - start),
        tool: annotation.tool,
      }));
      return <span key={`raw-text-${index}`} {...common}>{renderAnnotatedText(token.value, local)}</span>;
    }
    const math = <MathText text={token.raw} />;
    if (!annotations.length) return <span key={`raw-math-${index}`} {...common} data-canonical-raw-atomic="true">{math}</span>;
    const annotation = annotations[0];
    return <span key={`raw-math-${index}`} {...common} data-canonical-raw-atomic="true"><mark className={`ann-${annotation.tool}`} data-ann-id={annotation.id}>{math}</mark></span>;
  });
}

interface QuestionContentViewProps {
  text: string;
  segments?: QuestionContentSegment[];
  figures?: SheetFigureItem[];
  appendUnreferencedFigures?: boolean;
  annotations?: TextRangeAnnotation[];
  legacyQuestion?: string;
  choices?: string[];
}

function FigureContent({ figure }: { figure: SheetFigureItem }) {
  const representation = resolveFigureRepresentation(figure);
  if (representation.kind === "semantic_render" && figure.semanticSpec) return <SemanticFigureView spec={figure.semanticSpec} title={figure.title} />;
  if (representation.kind === "described_only" || !representation.image) {
    return <aside className="question-described-figure"><strong>도표 설명</strong><p>{figure.caption || figure.title || "이미지 없이 설명만 제공됩니다."}</p></aside>;
  }
  const label = representation.kind === "original" ? "원본 그림" : "GPT 정리본";
  return <figure className="question-source-figure"><figcaption>{label}{figure.title ? ` · ${figure.title}` : ""}{representation.needsReview ? " · 검토 필요" : ""}</figcaption><ZoomableImageViewer filenames={[representation.image]} /></figure>;
}

export function resolveCanonicalAnnotationRanges(segments: QuestionContentSegment[], annotations: TextRangeAnnotation[], legacyQuestion?: string) {
  const ranges = new Map<string, Array<{ id: string; start: number; end: number; tool: TextRangeAnnotation["tool"] }>>();
  const unresolved: TextRangeAnnotation[] = [];
  const add = (segmentId: string, annotation: TextRangeAnnotation, start: number, end: number) => {
    const list = ranges.get(segmentId) ?? [];
    list.push({ id: annotation.id, start, end, tool: annotation.tool });
    ranges.set(segmentId, list);
  };
  for (const annotation of annotations) {
    if (annotation.canonicalAnchors?.length) {
      const textSegments = new Map(segments.filter((segment): segment is Extract<QuestionContentSegment, { type: "text" | "condition" }> => segment.type === "text" || segment.type === "condition").map((segment) => [segment.id, segment.text]));
      const validAnchors = annotation.canonicalAnchors.filter((anchor) => {
        const content = textSegments.get(anchor.segmentId);
        return content !== undefined && Number.isInteger(anchor.start) && Number.isInteger(anchor.end) && anchor.start >= 0 && anchor.end > anchor.start && anchor.end <= content.length;
      });
      for (const anchor of validAnchors) add(anchor.segmentId, annotation, anchor.start, anchor.end);
      if (validAnchors.length !== annotation.canonicalAnchors.length) unresolved.push(annotation);
      continue;
    }
    const fragment = legacyQuestion?.slice(annotation.start, annotation.end);
    if (!fragment) { unresolved.push(annotation); continue; }
    const matches: Array<{ segmentId: string; start: number }> = [];
    for (const segment of segments) {
      if (segment.type !== "text" && segment.type !== "condition") continue;
      const index = segment.text.indexOf(fragment);
      if (index >= 0) {
        if (segment.text.indexOf(fragment, index + fragment.length) >= 0) {
          matches.push({ segmentId: segment.id, start: index }, { segmentId: segment.id, start: segment.text.indexOf(fragment, index + fragment.length) });
        } else matches.push({ segmentId: segment.id, start: index });
      }
    }
    if (matches.length === 1) add(matches[0].segmentId, annotation, matches[0].start, matches[0].start + fragment.length);
    else unresolved.push(annotation);
  }
  return { ranges, unresolved };
}

export default function QuestionContentView({ text, segments, figures = [], appendUnreferencedFigures = true, annotations = [], legacyQuestion, choices = [] }: QuestionContentViewProps) {
  const byId = new Map(figures.map((figure) => [figure.id, figure]));
  const rendered = segments?.length ? segments : [{ id: "fallback", type: "text" as const, text }];
  const { ranges } = resolveCanonicalAnnotationRanges(rendered, annotations, legacyQuestion);
  const figureIdsInText = (value: string) => [...value.matchAll(/\[FIGURE(?::([^\]]*))?(?:\]|$)/gi)]
    .map((match) => match[1]?.trim()).filter((id): id is string => Boolean(id));
  const referenced = new Set<string>([...rendered.flatMap((segment) => {
    if (segment.type === "figure") return [segment.figureId];
    if (segment.type !== "text" && segment.type !== "condition") return [];
    return figureIdsInText(segment.text);
  }), ...choices.flatMap(figureIdsInText)]);
  const unreferencedFigures = figures.filter((figure) => !referenced.has(figure.id));
  return <div className="question-content-view">
    {rendered.map((segment) => {
      if (segment.type === "figure") {
        const figure = byId.get(segment.figureId);
        return figure ? <FigureContent key={segment.id} figure={figure} /> : <p key={segment.id} className="question-figure-missing" role="note">[그림 연결 확인 필요: {segment.figureId}]</p>;
      }
      if (segment.type === "condition") {
        const conditionText = segment.label
          ? segment.text.replace(new RegExp(`^${segment.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`), "")
          : segment.text;
        const anchoredRanges = (ranges.get(segment.id) ?? []).map(({ id, start, end, tool }) => ({ id, target: "question" as const, kind: "text" as const, start, end, tool }));
        return <p key={segment.id} className="question-condition-line">{segment.label ? <strong>{segment.label} </strong> : null}<span data-canonical-segment-id={segment.id}><InlineQuestionText text={conditionText} figures={figures} renderText={(part, offset) => renderCanonicalAnnotatedText(part, offset, anchoredRanges)} /></span></p>;
      }
      if (segment.type === "equation") return <div key={segment.id} className="question-equation"><MathText text={segment.display ? `\\[${segment.latex}\\]` : `\\(${segment.latex}\\)`} /></div>;
      if (segment.type === "table") return <div key={segment.id} className="question-table-wrap"><table><tbody>{segment.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><MathText text={cell} /></td>)}</tr>)}</tbody></table></div>;
      const anchoredRanges = (ranges.get(segment.id) ?? []).map(({ id, start, end, tool }) => ({ id, target: "question" as const, kind: "text" as const, start, end, tool }));
      return <p key={segment.id}><span data-canonical-segment-id={segment.id}><InlineQuestionText text={segment.text} figures={figures} renderText={(part, offset) => renderCanonicalAnnotatedText(part, offset, anchoredRanges)} /></span></p>;
    })}
    {choices.length > 0 && <QuestionChoiceList choices={choices} segments={rendered} figures={figures} />}
    {appendUnreferencedFigures
      ? unreferencedFigures.map((figure) => <FigureContent key={figure.id} figure={figure} />)
      : unreferencedFigures.map((figure) => <p key={`unplaced-${figure.id}`} className="question-figure-missing" role="note">[그림 위치 연결 확인 필요: {figure.id}]</p>)}
  </div>;
}
