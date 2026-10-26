import { useState } from "react";
import type { SheetFigureItem } from "../../../types";
import FigureComparisonPanel from "./FigureComparisonPanel";
import { selectFigureRepresentation } from "../services/selectFigureRepresentation";
import Dialog from "../../../shared/ui/Dialog";

interface Props { figure: SheetFigureItem; disabled?: boolean; resolveImageUrl?: (filename: string) => Promise<string>; onChange: (patch: Partial<SheetFigureItem>) => void; }

function FigureReviewContent({ figure, disabled = false, resolveImageUrl, onChange }: Props) {
  const [readyFor, setReadyFor] = useState("");
  const identity = JSON.stringify([figure.id, figure.original, figure.cleaned, figure.semanticSpec]);
  const ready = readyFor === identity;
  const blocked = figure.processingStatus === "rejected" || Boolean(figure.verification?.blockingIssues.length);
  return <article className="figure-review-card">
    <strong>{figure.title || `${figure.questionNumber}번 그림`}</strong>
    {figure.caption && <p>{figure.caption}</p>}
    <FigureComparisonPanel figure={figure} resolveImageUrl={resolveImageUrl} onReady={value => setReadyFor(value ? identity : "")} />
    <div className="import-figure-actions">
      {figure.original?.image && <button type="button" className="btn-secondary btn-sm" disabled={disabled} onClick={() => onChange(selectFigureRepresentation(figure, "original", false))}>원본 사용</button>}
      {figure.cleaned?.image && <button type="button" className="btn-secondary btn-sm" disabled={disabled || !ready || blocked} onClick={() => onChange(selectFigureRepresentation(figure, "cleaned", ready))}>정리본 사용</button>}
      {figure.semanticSpec && <button type="button" className="btn-secondary btn-sm" disabled={disabled || !ready || blocked} onClick={() => onChange(selectFigureRepresentation(figure, "semantic_render", ready))}>구조 렌더링 사용</button>}
    </div>
  </article>;
}

export default function FigureReviewCard(props: Props) {
  const [expanded, setExpanded] = useState(false);
  return <>
    <button type="button" className="btn-secondary btn-sm" onClick={() => setExpanded(true)}>원본·정리본 크게 비교</button>
    <FigureReviewContent {...props} />
    <Dialog open={expanded} onClose={() => setExpanded(false)} size="xl" backdropClassName="modal-backdrop figure-comparison-backdrop" className="figure-comparison-dialog" title="원본·정리본 크게 비교" header={<button type="button" className="btn-secondary btn-sm" aria-label="그림 비교 닫기" onClick={() => setExpanded(false)}>닫기</button>}>
      <p>확대해서 점·라벨·열린점과 선의 모양을 확인하세요. 선택은 시험지를 저장할 때 함께 저장됩니다.</p>
      <FigureReviewContent {...props} />
    </Dialog>
  </>;
}
