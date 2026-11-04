import { useEffect, useState } from "react";
import type { OriginalDocument } from "../../models/entry";
import { readOriginal } from "../../services/originalDocuments";
import Dialog from "../../shared/ui/Dialog";
import { rasterizeVisualImportFile } from "../../utils/visualImportFiles";
import { getRealExamProtection, useRealExamProtection } from "../exam/services/realExamProtection";
import { downloadBlob } from "../export/services/questionExport";

function originalsBlocked() {
  const protection = getRealExamProtection();
  return protection.unavailable || protection.sessions.length > 0;
}

function OriginalViewer({ doc, initialPage }: { doc: OriginalDocument; initialPage: number }) {
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1.5);
  const [file, setFile] = useState<File>();
  const [readError, setReadError] = useState("");
  const [preview, setPreview] = useState<{ page: number; zoom: number; url?: string; error?: string }>();
  const pdf = doc.mime === "application/pdf";

  useEffect(() => {
    let cancelled = false;
    void readOriginal(doc).then(bytes => {
      if (!cancelled && !originalsBlocked()) setFile(new File([bytes], doc.filename, { type: doc.mime }));
    }).catch(error => { if (!cancelled) setReadError(String(error)); });
    return () => { cancelled = true; };
  }, [doc]);

  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    let url: string | undefined;
    const rendered = pdf ? rasterizeVisualImportFile(file, { physicalPage: page, scale: zoom, signal: controller.signal }).then(result => result[0]) : Promise.resolve(file);
    void rendered.then(image => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(image);
      setPreview({ page, zoom, url });
    }).catch(error => {
      if (!controller.signal.aborted) setPreview({ page, zoom, error: String(error) });
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, page, pdf, zoom]);

  const visible = preview?.page === page && preview.zoom === zoom ? preview : undefined;
  return <>
    <p>{doc.filename} · {doc.byteLength.toLocaleString()}바이트</p>
    <div className="original-page-study__tools">
      {pdf && <>
        <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전 물리 페이지</button>
        <span aria-live="polite">{page} / {doc.pageCount}</span>
        <button type="button" className="btn-secondary" disabled={page >= doc.pageCount} onClick={() => setPage(page + 1)}>다음 물리 페이지</button>
        <button type="button" className="btn-secondary" disabled={zoom <= 0.5} onClick={() => setZoom(zoom - 0.5)}>축소</button>
        <button type="button" className="btn-secondary" disabled={zoom >= 3} onClick={() => setZoom(zoom + 0.5)}>확대</button>
      </>}
      <button type="button" className="btn-secondary" disabled={!file} onClick={() => {
        if (file && !originalsBlocked()) downloadBlob(file, doc.filename);
      }}>원본 그대로 다운로드</button>
    </div>
    {readError || visible?.error ? <p role="alert">{readError || visible?.error}</p>
      : visible?.url ? <div className="original-document-preview"><img src={visible.url} alt={`원본 ${page}페이지`} /></div>
        : <p role="status">원본 문서를 읽는 중입니다.</p>}
  </>;
}

export default function OriginalDocumentControls({ documents, pageImage }: { documents: OriginalDocument[]; pageImage?: string }) {
  const protection = useRealExamProtection();
  const blocked = protection.unavailable || protection.sessions.length > 0;
  const [opened, setOpened] = useState<number | null>(null);
  const selected = opened === null ? undefined : documents[opened];
  const linked = documents.findIndex(doc => doc.pages.some(page => page.sourcePageImage === pageImage));
  return <>
    {!documents.some(doc => doc.mime === "application/pdf") && <span className="form-hint">원본 PDF 없음</span>}
    {documents.length > 0 && <button type="button" className="btn-secondary" disabled={blocked} onClick={() => setOpened(linked < 0 ? 0 : linked)}>보존된 원본 파일</button>}
    {selected && !blocked && <Dialog open onClose={() => setOpened(null)} title="보존된 원본 파일" size="xl"
      footer={<button type="button" className="btn-secondary" onClick={() => setOpened(null)}>닫기</button>}>
      <p className="form-hint">원본 파일에는 인쇄된 답안이 포함될 수 있습니다. 파란 점과 주석은 기존 원본 페이지 보기에서 사용합니다.</p>
      {documents.length > 1 && <label>원본 파일 <select value={opened ?? 0} onChange={event => setOpened(Number(event.target.value))}>
        {documents.map((doc, index) => <option key={doc.sourceKey + index} value={index}>{doc.filename} · {doc.sourceKey}</option>)}
      </select></label>}
      <OriginalViewer key={selected.sourceKey + selected.originalAssetId} doc={selected}
        initialPage={selected.pages.find(page => page.sourcePageImage === pageImage)?.physicalPage ?? 1} />
    </Dialog>}
  </>;
}
