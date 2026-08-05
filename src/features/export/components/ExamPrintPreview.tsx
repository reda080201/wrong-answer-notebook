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
  const [continueWithMissingImages, setContinueWithMissingImages] = useState(false);

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
    const failed = Object.entries(imageUrls).filter(([, url]) => !url).map(([filename]) => filename);
    if (failed.length && !continueWithMissingImages) {
      setError(`이미지 ${failed.length}개를 불러오지 못했습니다. 목록을 확인한 뒤 누락 상태로 인쇄할 수 있습니다.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await printExamDocument(model);
      if (result.failedImages.length) setError(`인쇄 창에서 이미지 ${result.failedImages.join(", ")}을(를) 불러오지 못했습니다.`);
    }
    catch (err) { setError(err instanceof Error ? err.message : "인쇄를 시작하지 못했습니다."); }
    finally { setBusy(false); }
  };

  return (
    <div className="export-exam-print-preview">
      <header className="export-panel-header exam-print-chrome">
        <div>
          <h3>시험지 미리보기</h3>
          <p>{model.title} · {model.scopeLabel} · {model.resolvedPaperSize.toUpperCase()} · {model.resolvedOrientation === "landscape" ? "가로" : "세로"} · {model.resolvedLayout === "columns" ? "2단" : "1단"}</p>
        </div>
        <div className="export-panel-actions">
          <button type="button" className="btn-secondary" onClick={onBack} disabled={busy}>설정으로 돌아가기</button>
          <button type="button" className="btn-primary" onClick={() => void handlePrint()} disabled={busy}>{busy ? "준비 중..." : "시스템 인쇄창 열기"}</button>
        </div>
      </header>
      {error ? <p className="form-error exam-print-chrome">{error}</p> : null}
      {Object.entries(imageUrls).filter(([, url]) => !url).length > 0 ? (
        <div className="exam-print-chrome form-hint">
          <p>불러오지 못한 이미지: {Object.entries(imageUrls).filter(([, url]) => !url).map(([filename]) => filename).join(", ")}</p>
          <label><input type="checkbox" checked={continueWithMissingImages} onChange={(event) => setContinueWithMissingImages(event.target.checked)} /> 누락 이미지를 확인했고 계속 인쇄합니다.</label>
        </div>
      ) : null}
      <p className="exam-print-chrome form-hint">인쇄창에서 PDF로 저장할 수 있습니다.</p>
      <div className="export-preview-frame">
        <ExamPrintDocument model={model} imageUrls={imageUrls} />
      </div>
    </div>
  );
}

