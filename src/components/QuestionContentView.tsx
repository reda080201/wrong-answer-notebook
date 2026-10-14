import { parseQuestionText } from "../utils/textLayout";
import { normalizeQuestionNumber } from "../utils/questionNumber";
import { canonicalAnnotationOwner, canonicalAnnotationText, type CanonicalAnnotationContext } from "../utils/canonicalAnnotations";
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
  /** Figure tokens already rendered in the shared passage. */
  referencedPassage?: string;
  annotations?: TextRangeAnnotation[];
  legacyQuestion?: string;
  annotationContext?: CanonicalAnnotationContext;
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

export function resolveCanonicalAnnotationRanges(segments: QuestionContentSegment[], annotations: TextRangeAnnotation[], legacyQuestion?: string, context?: CanonicalAnnotationContext) {
  const ranges = new Map<string, Array<{ id: string; start: number; end: number; tool: TextRangeAnnotation["tool"] }>>();
  const unresolved: TextRangeAnnotation[] = [];
  const add = (segmentId: string, annotation: TextRangeAnnotation, start: number, end: number) => {
    const list = ranges.get(segmentId) ?? [];
    list.push({ id: annotation.id, start, end, tool: annotation.tool });
    ranges.set(segmentId, list);
  };
  for (const annotation of annotations) {
    if (annotation.canonicalAnchors?.length) {
      if (context) {
        const owner = canonicalAnnotationOwner(annotation, context);
        if (!owner || !context.questionKey) { unresolved.push(annotation); continue; }
        if (owner !== context.questionKey) continue;
      } else if (annotation.canonicalQuestionKey) { unresolved.push(annotation); continue; }
      const textSegments = new Map(segments.filter((segment): segment is Extract<QuestionContentSegment, { type: "text" | "condition" }> => segment.type === "text" || segment.type === "condition").map((segment) => [segment.id, canonicalAnnotationText(segment)!]));
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
    if (context) {
      const sourceBlocks = parseQuestionText(legacyQuestion ?? "").filter(block => block.kind === "question" && annotation.start >= block.start && annotation.end <= block.end);
      const sourceNumber = sourceBlocks.length === 1 && sourceBlocks[0].kind === "question" ? normalizeQuestionNumber(sourceBlocks[0].numberLabel || String(sourceBlocks[0].displayNumber)) : undefined;
      const sourceOwners = sourceNumber ? context.questions.filter(question => { try { return JSON.parse(question.key)[0] === sourceNumber; } catch { return false; } }) : [];
      const candidates = sourceOwners.length === 1 ? sourceOwners : context.questions;
      const owners = candidates.flatMap(question => question.segments.flatMap(segment => {
        const text = canonicalAnnotationText(segment);
        if (text === undefined) return [];
        const first = text.indexOf(fragment);
        return first < 0 ? [] : text.indexOf(fragment, first + fragment.length) >= 0 ? [question.key, question.key] : [question.key];
      }));
      if (owners.length !== 1 || !context.questionKey) { unresolved.push(annotation); continue; }
      if (owners[0] !== context.questionKey) continue;
    }
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

export default function QuestionContentView({ text, segments, figures = [], appendUnreferencedFigures = true, referencedPassage, annotations = [], legacyQuestion, annotationContext, choices = [] }: QuestionContentViewProps) {
  const byId = new Map(figures.map((figure) => [figure.id, figure]));
  const rendered = segments?.length ? segments : [{ id: "fallback", type: "text" as const, text }];
  const { ranges } = resolveCanonicalAnnotationRanges(rendered, annotations, legacyQuestion, annotationContext);
  const figureIdsInText = (value: string) => [...value.matchAll(/\[FIGURE(?::([^\]]*))?(?:\]|$)/gi)]
    .map((match) => match[1]?.trim()).filter((id): id is string => Boolean(id));
  const referenced = new Set<string>([...rendered.flatMap((segment) => {
    if (segment.type === "figure") return [segment.figureId];
    if (segment.type !== "text" && segment.type !== "condition") return [];
    return figureIdsInText(segment.text);
  }), ...choices.flatMap(figureIdsInText), ...figureIdsInText(referencedPassage ?? "")]);
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
