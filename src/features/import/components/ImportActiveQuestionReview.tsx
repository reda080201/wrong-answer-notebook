import type { SheetAnswerItem, SheetFigureItem } from "../../../types";
import FigureReviewCard from "../../figures/components/FigureReviewCard";
import ImportAnswerReviewList from "./ImportAnswerReviewList";

interface ImportActiveQuestionReviewProps {
  questionNumber: string;
  answers: SheetAnswerItem[];
  figures: SheetFigureItem[];
  detailOpen: boolean;
  disabled?: boolean;
  resolveImageUrl?: (filename: string) => Promise<string>;
  onUpdateAnswer(id: string, patch: Partial<SheetAnswerItem>): void;
  onRemoveAnswer(id: string): void;
  onUpdateFigure(id: string, patch: Partial<SheetFigureItem>): void;
  onRemoveFigure(id: string): void;
}

export default function ImportActiveQuestionReview({
  questionNumber,
  answers,
  figures,
  detailOpen,
  disabled,
  resolveImageUrl,
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
              <FigureReviewCard figure={figure} disabled={disabled} resolveImageUrl={resolveImageUrl} onChange={patch => onUpdateFigure(figure.id, patch)} />
              <button type="button" disabled={disabled} className="btn-secondary btn-sm danger" onClick={() => onRemoveFigure(figure.id)}>도표 항목 제외</button>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
