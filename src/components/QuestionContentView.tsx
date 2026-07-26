import type { QuestionContentSegment, SheetFigureItem } from "../types";
import MathText from "./MathText";
import ZoomableImageViewer from "./ZoomableImageViewer";
import SemanticFigureView from "../features/figures/components/SemanticFigureView";
import { resolveFigureRepresentation } from "../features/figures/services/figureRepresentation";

interface QuestionContentViewProps {
  text: string;
  segments?: QuestionContentSegment[];
  figures?: SheetFigureItem[];
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

export default function QuestionContentView({ text, segments, figures = [] }: QuestionContentViewProps) {
  const byId = new Map(figures.map((figure) => [figure.id, figure]));
  const rendered = segments?.length ? segments : [{ id: "fallback", type: "text" as const, text }];
  const referenced = new Set<string>();
  return <div className="question-content-view">
    {rendered.map((segment) => {
      if (segment.type === "figure") {
        referenced.add(segment.figureId);
        const figure = byId.get(segment.figureId);
        return figure ? <FigureContent key={segment.id} figure={figure} /> : <p key={segment.id} className="question-figure-missing">그림 위치 정보를 확인할 수 없습니다.</p>;
      }
      if (segment.type === "condition") return <section key={segment.id} className="question-condition-box"><strong>{segment.label ?? "조건"}</strong><MathText text={segment.text} /></section>;
      if (segment.type === "equation") return <div key={segment.id} className="question-equation"><MathText text={segment.display ? `\\[${segment.latex}\\]` : `\\(${segment.latex}\\)`} /></div>;
      if (segment.type === "table") return <div key={segment.id} className="question-table-wrap"><table><tbody>{segment.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><MathText text={cell} /></td>)}</tr>)}</tbody></table></div>;
      return <p key={segment.id}><MathText text={segment.text} /></p>;
    })}
    {figures.filter((figure) => !referenced.has(figure.id)).map((figure) => <FigureContent key={figure.id} figure={figure} />)}
  </div>;
}
