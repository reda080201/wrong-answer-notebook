import { useEffect, useState } from "react";
import { getImageUrl } from "../../../api";
import type { ExamPrintModel } from "../types";
import { printExamDocument } from "../services/printExamDocument";
import ExamPrintDocument from "./ExamPrintDocument";

interface ExamPrintPreviewProps {
  model: ExamPrintModel;
  onBack: () => void;
}

export default function ExamPrintPreview({ model, onBack }: ExamPrintPreviewProps) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const names = new Set<string>();
    for (const question of model.questions) {
      for (const figure of question.figures ?? []) {
        if (figure.image) names.add(figure.image);
      }
    }
    for (const filename of model.sourcePageImages) names.add(filename);
    void (async () => {
      const entries = await Promise.all([...names].map(async (filename) => {
        try { return [filename, await getImageUrl(filename)] as const; }
        catch { return [filename, ""] as const; }
      }));
      if (!cancelled) setImageUrls(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [model]);

  const handlePrint = async () => {
    setBusy(true);
    setError(null);
    try { await printExamDocument(model); }
    catch (err) { setError(err instanceof Error ? err.message : "인쇄를 시작하지 못했습니다."); }
    finally { setBusy(false); }
  };

  return (
    <div className="export-exam-print-preview">
      <header className="export-panel-header exam-print-chrome">
        <div>
          <h3>시험지 미리보기</h3>
          <p>{model.title} · {model.scopeLabel} · {model.preferences.paperSize.toUpperCase()} · {model.preferences.layout} · 예상 {Math.max(1, model.questions.length + (model.includeAnswerSheet ? 1 : 0) + model.extraScratchPages)}페이지</p>
        </div>
        <div className="export-panel-actions">
          <button type="button" className="btn-secondary" onClick={onBack} disabled={busy}>설정으로 돌아가기</button>
          <button type="button" className="btn-primary" onClick={() => void handlePrint()} disabled={busy}>{busy ? "준비 중..." : "인쇄/PDF 저장"}</button>
        </div>
      </header>
      {error ? <p className="form-error exam-print-chrome">{error}</p> : null}
      <div className="export-preview-frame">
        <ExamPrintDocument model={model} imageUrls={imageUrls} />
      </div>
    </div>
  );
}

