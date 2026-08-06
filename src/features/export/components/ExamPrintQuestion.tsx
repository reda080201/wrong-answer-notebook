import MathText from "../../../components/MathText";
import type { ExamPrintQuestionModel } from "../types";
import SemanticFigureView from "../../figures/components/SemanticFigureView";
import { resolveFigureRepresentation } from "../../figures/services/figureRepresentation";

interface ExamPrintQuestionProps {
  question: ExamPrintQuestionModel;
  imageUrls: Record<string, string>;
  workspaceSize: "none" | "small" | "normal" | "large";
}

export default function ExamPrintQuestion({ question, imageUrls, workspaceSize }: ExamPrintQuestionProps) {
  const long = (question.segments?.length ?? 0) > 8 || (question.figures?.length ?? 0) > 0 || (question.choices?.length ?? 0) === 0;
  const renderedFigureIds = new Set(
    (question.segments ?? [])
      .filter((segment) => segment.type === "figure")
      .map((segment) => segment.figureId),
  );
  const renderFigure = (figure: NonNullable<ExamPrintQuestionModel["figures"]>[number], key: string) => {
    const representation = figure.resolvedRepresentation ?? resolveFigureRepresentation(figure, { forPrint: true }).kind;
    if (representation === "semantic_render" && figure.semanticSpec) {
      return <div key={key} className="exam-print-figure exam-print-semantic"><SemanticFigureView spec={figure.semanticSpec} title={figure.title} /></div>;
    }
    if (figure.source === "described_only" || !figure.image) {
      return <aside key={key} className="exam-print-described"><strong>도표 설명</strong><p>{figure.caption || figure.title || "이미지 없이 설명만 제공됩니다."}</p></aside>;
    }
    const url = imageUrls[figure.image] ?? "";
    return <figure key={key} className="exam-print-figure">{url ? <img data-print-filename={figure.image} className="exam-print-img" src={url} alt={figure.title || figure.caption || figure.image} /> : <figcaption>{figure.caption || figure.title || figure.image}</figcaption>}</figure>;
  };
  return (
    <section className={`exam-print-question${long ? " is-long" : ""}`}>
      <header>
        <span className="exam-print-question-number">{question.displayNumber}.</span>
      </header>
      {question.sourceLabel ? <p className="exam-print-source-label">원본: {question.sourceLabel}</p> : null}
      {(question.segments ?? []).map((segment) => {
        if (segment.type === "condition") {
          return (
            <div key={segment.id} className="exam-print-condition">
              <strong>{segment.label ?? "조건"}</strong>
              <MathText text={segment.text} />
            </div>
          );
        }
        if (segment.type === "equation") {
          const wrapped = segment.display ? `\\[${segment.latex}\\]` : `\\(${segment.latex}\\)`;
          return <div key={segment.id} className="exam-print-equation"><MathText text={wrapped} /></div>;
        }
        if (segment.type === "table") {
          return (
            <div key={segment.id} className="exam-print-table"><table><tbody>
              {segment.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><MathText text={cell} /></td>)}</tr>
              ))}
            </tbody></table></div>
          );
        }
        if (segment.type === "figure") {
          const figure = (question.figures ?? []).find((item) => item.id === segment.figureId);
          if (!figure) return <p key={segment.id}>그림 위치 정보를 확인할 수 없습니다.</p>;
          return renderFigure(figure, segment.id);
        }
        return <p key={segment.id}><MathText text={segment.text} /></p>;
      })}
      {(question.figures ?? []).filter((figure) => !renderedFigureIds.has(figure.id)).map((figure) => renderFigure(figure, `after-${figure.id}`))}
      {(question.choices ?? []).length ? (
        <ol className="exam-print-choices">
          {question.choices.map((choice, index) => <li key={`${question.questionNumber}-${index}`}><MathText text={choice} /></li>)}
        </ol>
      ) : null}
      {workspaceSize !== "none" ? <div className={`exam-print-workspace ${workspaceSize}`} /> : null}
    </section>
  );
}

