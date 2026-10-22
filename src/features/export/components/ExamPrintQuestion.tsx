import MathText from "../../../components/MathText";
import type { ExamPrintQuestionModel } from "../types";
import SemanticFigureView from "../../figures/components/SemanticFigureView";
import { resolveFigureRepresentation } from "../../figures/services/figureRepresentation";
import { Fragment } from "react";
import { readFigureTokenReferences } from "../../../utils/figureTokens";

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
      .map((segment) => segment.figureId).concat(readFigureTokenReferences([
        ...question.segments.flatMap(segment => segment.type === "text" || segment.type === "condition" ? [segment.text] : []),
        ...question.choices, question.passage,
      ]).map(reference => reference.id)),
  );
  const renderFigure = (figure: NonNullable<ExamPrintQuestionModel["figures"]>[number], key: string, inline = false) => {
    const resolved = resolveFigureRepresentation(figure, { forPrint: true });
    const representation = figure.resolvedRepresentation ?? resolved.kind;
    if (representation === "semantic_render" && figure.semanticSpec) {
      return <div key={key} className="exam-print-figure exam-print-semantic"><SemanticFigureView spec={figure.semanticSpec} title={figure.title} /></div>;
    }
    const filename = resolved.image ?? figure.image;
    if (representation === "described_only" || !filename) {
      return <span key={key} className="exam-print-described">도표 설명: {figure.caption || figure.title || "이미지 없이 설명만 제공됩니다."}</span>;
    }
    const url = imageUrls[filename] ?? "";
    const image = url ? <img data-print-filename={filename} className="exam-print-img" src={url} alt={figure.title || figure.caption || filename} /> : <span>그림을 불러오지 못했습니다: {figure.title || filename}</span>;
    return inline ? <span key={key} className="exam-print-inline-figure">{image}</span> : <figure key={key} className="exam-print-figure">{image}</figure>;
  };
  const renderText = (text: string, key: string) => {
    let cursor = 0;
    const parts = [];
    for (const match of text.matchAll(/\[FIGURE(?::([^\]]*))?(?:\]|$)/gi)) {
      const offset = match.index!;
      parts.push(<MathText key={`${key}-${cursor}`} text={text.slice(cursor, offset)} />);
      const matches = question.figures.filter(figure => figure.id === match[1]?.trim());
      parts.push(matches.length === 1 ? renderFigure(matches[0], `${key}-figure-${offset}`, true) : <span key={`${key}-missing-${offset}`}>[그림 연결 확인 필요: {match[1] || "빈 ID"}]</span>);
      cursor = offset + match[0].length;
    }
    parts.push(<MathText key={`${key}-end`} text={text.slice(cursor)} />);
    return <Fragment>{parts}</Fragment>;
  };
  return (
    <section className={`exam-print-question${long ? " is-long" : ""}`}>
      {question.sourceLabel ? <p className="exam-print-source-label">{question.sourceLabel}</p> : null}
      <header>
        <span className="exam-print-question-number">{question.displayNumber}.</span>
      </header>
      {question.passage && <div className="exam-print-passage">{renderText(question.passage, "passage")}</div>}
      {(question.segments ?? []).map((segment) => {
        if (segment.type === "condition") {
          return (
            <div key={segment.id} className="exam-print-condition">
              {segment.label && <strong>{segment.label} </strong>}
              {renderText(segment.text, segment.id)}
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
          const figures = (question.figures ?? []).filter((item) => item.id === segment.figureId);
          if (figures.length !== 1) return <p key={segment.id}>그림 위치 정보를 확인할 수 없습니다.</p>;
          return renderFigure(figures[0], segment.id);
        }
        return <div key={segment.id}>{renderText(segment.text, segment.id)}</div>;
      })}
      {(question.figures ?? []).filter((figure) => !renderedFigureIds.has(figure.id)).map((figure) => <p key={`unplaced-${figure.id}`}>[그림 위치 연결 확인 필요: {figure.id}]</p>)}
      {(question.choices ?? []).length ? (
        <ol className="exam-print-choices">
          {question.choices.map((choice, index) => <li key={`${question.questionNumber}-${index}`}>{renderText(choice, `choice-${index}`)}</li>)}
        </ol>
      ) : null}
      {workspaceSize !== "none" ? <div className={`exam-print-workspace ${workspaceSize}`} /> : null}
    </section>
  );
}

