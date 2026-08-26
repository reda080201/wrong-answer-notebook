import type { SheetAnswerItem, SheetFigureItem } from "../../../types";
import FigureComparisonPanel from "../../figures/components/FigureComparisonPanel";
import ImageGallery from "../../../components/ImageGallery";
import ImportAnswerReviewList from "./ImportAnswerReviewList";

interface ImportActiveQuestionReviewProps {
  questionNumber: string;
  answers: SheetAnswerItem[];
  figures: SheetFigureItem[];
  sourcePageImages: string[];
  detailOpen: boolean;
  onUpdateAnswer(id: string, patch: Partial<SheetAnswerItem>): void;
  onRemoveAnswer(id: string): void;
  onUpdateFigure(id: string, patch: Partial<SheetFigureItem>): void;
  onRemoveFigure(id: string): void;
}

export default function ImportActiveQuestionReview({
  questionNumber,
  answers,
  figures,
  sourcePageImages,
  detailOpen,
  onUpdateAnswer,
  onRemoveAnswer,
  onUpdateFigure,
  onRemoveFigure,
}: ImportActiveQuestionReviewProps) {
  return (
    <section className="import-active-question-review" aria-label={`${questionNumber}번 부가 검수`}>
      {answers.length > 0 && (
        <section className="import-active-answer" aria-label={`${questionNumber}번 답안 검수`}>
          <h3>답안</h3>
          <ImportAnswerReviewList
            items={answers}
            defaultDetailsOpen={detailOpen}
            onUpdate={onUpdateAnswer}
            onRemove={onRemoveAnswer}
          />
        </section>
      )}
      {figures.length > 0 && (
        <section className="import-active-figures" aria-label={`${questionNumber}번 그림 검수`}>
          <h3>그림·표 배치</h3>
          {figures.map((figure) => (
            <article key={figure.id} className="import-active-figure">
              <strong>{figure.title || `${questionNumber}번 그림`}</strong>
              {figure.caption && <p>{figure.caption}</p>}
              <small>{figure.image ? `연결됨: ${figure.image}` : figure.source === "described_only" ? "설명 도표" : "이미지 나중에 연결"}</small>
              {figure.original?.image && <button type="button" className="btn-secondary btn-sm" onClick={() => onUpdateFigure(figure.id, { preferredRepresentation: "original", image: figure.original?.image, source: "original", needsReview: Boolean(figure.needsReview) })}>원본 사용</button>}
              {figure.cleaned?.image && <button type="button" className="btn-secondary btn-sm" onClick={() => onUpdateFigure(figure.id, { preferredRepresentation: "cleaned", image: figure.cleaned?.image, source: "gpt_cleaned", needsReview: Boolean(figure.needsReview) })}>{figure.cleaned.generatedBy === "deterministic_cleanup" ? "자동 이미지 정리본 승인" : figure.cleaned.generatedBy === "deterministic_redraw" ? "결정론적 재구성 승인" : "AI 정리본 승인"}</button>}
              {figure.semanticSpec && <button type="button" className="btn-secondary btn-sm" onClick={() => onUpdateFigure(figure.id, { preferredRepresentation: "semantic_render", needsReview: false })}>구조 렌더링 사용</button>}
              {!figure.image && <button type="button" className="btn-secondary btn-sm" onClick={() => onUpdateFigure(figure.id, { source: "described_only", needsReview: false })}>설명 도표로 유지</button>}
              <button type="button" className="btn-secondary btn-sm danger" onClick={() => onRemoveFigure(figure.id)}>도표 항목 제외</button>
              {(figure.original || figure.cleaned || figure.semanticSpec) && <FigureComparisonPanel figure={figure} onReady={() => undefined} />}
            </article>
          ))}
        </section>
      )}
      {sourcePageImages.length > 0 && <aside className="import-active-source" aria-label={`${questionNumber}번 원본 페이지`}><h3>원본 페이지</h3><ImageGallery filenames={sourcePageImages} variant="fill" /></aside>}
    </section>
  );
}
