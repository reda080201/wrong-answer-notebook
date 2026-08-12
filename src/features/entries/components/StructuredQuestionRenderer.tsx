import katex from "katex";
import type { ReactNode } from "react";
import type { QuestionContentSegment, SheetFigureItem, WrongAnswerEntry } from "../../../types";
import MathText from "../../../components/MathText";
import ZoomableImageViewer from "../../../components/ZoomableImageViewer";
import SemanticFigureView from "../../figures/components/SemanticFigureView";
import { resolveFigureRepresentation } from "../../figures/services/figureRepresentation";
import type { ResolvedEntryQuestion } from "../../../utils/entryQuestions";

export interface StructuredQuestionContext {
  entryId?: string;
  questionNumber?: string;
  position?: number;
  section?: string;
}

export interface StructuredQuestionRendererProps {
  question: ResolvedEntryQuestion;
  entry?: Pick<WrongAnswerEntry, "figures">;
  figures?: SheetFigureItem[];
  context?: StructuredQuestionContext;
  showQuestionLabel?: boolean;
}

function DirectEquation({ latex, display }: Extract<QuestionContentSegment, { type: "equation" }>) {
  let html: string | undefined;
  try {
    html = katex.renderToString(latex, {
      displayMode: display,
      throwOnError: true,
      trust: false,
      strict: "warn",
      output: "htmlAndMathml",
    });
  } catch {
    html = undefined;
  }
  if (!html) return <code className="structured-question-equation-fallback">{latex}</code>;
  return <span className={display ? "structured-question-equation structured-question-equation--display" : "structured-question-equation"} dangerouslySetInnerHTML={{ __html: html }} />;
}

function FigureSegment({ figure }: { figure: SheetFigureItem }) {
  const representation = resolveFigureRepresentation(figure);
  if (representation.kind === "semantic_render" && figure.semanticSpec) {
    return <SemanticFigureView spec={figure.semanticSpec} title={figure.title} />;
  }
  if (representation.kind === "described_only" || !representation.image) {
    return <aside className="structured-question-described-figure"><strong>도표 설명</strong><p>{figure.caption || figure.title || "이미지 없이 설명만 제공됩니다."}</p></aside>;
  }
  const label = representation.kind === "original" ? "원본 그림" : "GPT 정리본";
  return <figure className="structured-question-figure">
    <figcaption>{label}{figure.title ? ` · ${figure.title}` : ""}{representation.needsReview ? " · 검토 필요" : ""}</figcaption>
    <ZoomableImageViewer filenames={[representation.image]} />
  </figure>;
}

function SegmentContent({ segment, figures }: { segment: QuestionContentSegment; figures: Map<string, SheetFigureItem> }): ReactNode {
  if (segment.type === "text") return <MathText text={segment.text} />;
  if (segment.type === "condition") return <><strong>{segment.label ?? "조건"}</strong><MathText text={segment.text} /></>;
  if (segment.type === "equation") return <DirectEquation {...segment} />;
  if (segment.type === "table") {
    return <table><tbody>{segment.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><MathText text={cell} /></td>)}</tr>)}</tbody></table>;
  }
  const figure = figures.get(segment.figureId);
  return figure ? <FigureSegment figure={figure} /> : <p className="structured-question-missing-figure">그림 위치 정보를 확인할 수 없습니다.</p>;
}

export default function StructuredQuestionRenderer({ question, entry, figures, context, showQuestionLabel = false }: StructuredQuestionRendererProps) {
  const availableFigures = figures ?? entry?.figures ?? [];
  const figureById = new Map(availableFigures.map((figure) => [figure.id, figure]));
  const segments = question.contentSegments?.length
    ? question.contentSegments
    : [{ id: "question-text", type: "text" as const, text: question.questionText }];
  const label = context?.questionNumber ?? question.questionNumber;

  return <div className="structured-question-renderer">
    {showQuestionLabel ? <header className="structured-question-label">문제 {label}{context?.position ? ` · ${context.position}` : ""}</header> : null}
    {segments.map((segment) => {
      const className = `structured-question-segment structured-question-segment--${segment.type}`;
      return <div key={segment.id} className={className} data-segment-id={segment.id}><SegmentContent segment={segment} figures={figureById} /></div>;
    })}
  </div>;
}
