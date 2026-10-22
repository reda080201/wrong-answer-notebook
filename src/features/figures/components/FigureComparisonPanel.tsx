import { useEffect, useState } from "react";
import { getImageUrl } from "../../../api";
import type { SheetFigureItem } from "../../../types";
import SemanticFigureView from "./SemanticFigureView";

export interface FigureComparisonProps {
  figure: SheetFigureItem;
  onReady?: (ready: boolean) => void;
  resolveImageUrl?: (filename: string) => Promise<string>;
}
const methods: Record<string, string> = { pdf_vector_render: "PDF 원본 벡터 렌더", raster_cleanup: "이미지 정리", raster_tracing: "윤곽 추적", computational_redraw: "계산 기반 재구성", deterministic_cleanup: "이미지 정리", deterministic_redraw: "계산 기반 재구성", gpt: "AI 후보" };

function Comparison({ figure, onReady, resolveImageUrl = getImageUrl }: FigureComparisonProps) {
  const [urls, setUrls] = useState<{ original?: string; cleaned?: string }>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<{ resolver?: typeof resolveImageUrl; original?: boolean; cleaned?: boolean }>({});
  const [confirmed, setConfirmed] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [opacity, setOpacity] = useState(0.5);
  const [zoom, setZoom] = useState({ original: 1, cleaned: 1 });
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled((["original", "cleaned"] as const).map(async kind => {
      const filename = figure[kind]?.image;
      if (!filename) return undefined;
      const url = await resolveImageUrl(filename);
      if (!url) throw new Error("Empty image URL");
      return [kind, url] as const;
    })).then(results => {
      if (cancelled) return;
      const next: typeof urls = {};
      const errors: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value) next[result.value[0]] = result.value[1];
        else if (result.status === "rejected") errors.push(index === 0 ? "original" : "cleaned");
      });
      setUrls(next);
      setFailed(errors);
      setLoaded({ resolver: resolveImageUrl });
      setConfirmed(false);
    });
    return () => { cancelled = true; };
  }, [figure.original?.image, figure.cleaned?.image, resolveImageUrl]);
  const comparable = Boolean(loaded.resolver === resolveImageUrl && figure.original?.image && urls.original && loaded.original && !failed.length && (figure.cleaned?.image ? urls.cleaned && loaded.cleaned : figure.semanticSpec));
  const ready = comparable && confirmed;
  useEffect(() => { onReady?.(ready); }, [ready, onReady]);
  const method = figure.cleaned?.untrustedGeneratedBy ?? figure.cleaned?.generatedBy;
  return <section className="figure-comparison" aria-label={`${figure.questionNumber || "문항"}번 그림 비교`}>
    <p role="status">{figure.processingStatus === "rejected" ? "실패 · 원본 보존" : figure.representationSelectionSource === "user" ? figure.preferredRepresentation === "original" ? "사용자 선택 · 원본 유지" : "사용자 비교 확인 · 현재 선택" : "검토 필요 · 수학적 동일성 미확인"}</p>
    {method && <small>생성자 표기: {methods[method] ?? "기타 방식"} · 외부 표기는 앱의 검증 결과가 아닙니다.</small>}
    <div className="figure-comparison-grid">{(["original", "cleaned"] as const).map(kind => <figure key={kind}>
      <figcaption>{kind === "original" ? "원본 crop" : "새 PNG · 정리본 후보"}</figcaption>
      {urls[kind] ? <>
        <div className="figure-comparison-viewport"><img src={urls[kind]} alt={kind === "original" ? "원본 도형 crop" : "정리본 후보"} style={zoom[kind] > 1 ? { width: `${zoom[kind] * 100}%`, maxHeight: "none" } : undefined} onLoad={() => setLoaded(current => ({ ...current, [kind]: true }))} onError={() => { setLoaded(current => ({ ...current, [kind]: false })); setFailed(current => [...new Set([...current, kind])]); }} /></div>
        <label>{kind === "original" ? "원본 확대" : "정리본 확대"}<input aria-label={kind === "original" ? "원본 확대" : "정리본 확대"} type="range" min="1" max="3" step="0.25" value={zoom[kind]} onChange={event => setZoom(current => ({ ...current, [kind]: Number(event.target.value) }))} /></label>
      </> : <p>{failed.includes(kind) ? "이미지를 읽지 못했습니다." : figure[kind]?.image ? "이미지 불러오는 중…" : kind === "original" ? "원본 없음 · 후보 승인 불가" : "정리본 없음"}</p>}
    </figure>)}</div>
    {figure.semanticSpec && <details><summary>구조 데이터 미리보기</summary><SemanticFigureView spec={figure.semanticSpec} title={figure.title} /></details>}
    {!!failed.length && <p role="alert">이미지 로드 실패 · 원본을 보존하며 비교 승인을 차단합니다.</p>}
    {urls.original && urls.cleaned && <div className="figure-comparison-overlay"><button type="button" className="btn-secondary btn-sm" onClick={() => setOverlay(value => !value)} aria-pressed={overlay}>겹쳐보기{overlay ? " 끄기" : ""}</button>{overlay && <><label>투명도 <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} /></label><div className="figure-comparison-stack"><img src={urls.original} alt="원본 겹쳐보기" /><img src={urls.cleaned} alt="정리본 겹쳐보기" style={{ opacity }} /></div></>}</div>}
    <label className="figure-comparison-confirm"><input type="checkbox" checked={confirmed} disabled={!comparable} onChange={event => setConfirmed(event.target.checked)} /> 원본과 정리본을 비교했습니다</label>
    <small>파일 검사나 생성 성공만으로 점·라벨·함수의 일치를 보장하지 않습니다.</small>
    {figure.verification && <ul className="figure-comparison-issues">{[...figure.verification.blockingIssues, ...figure.verification.warnings].map((issue, index) => <li key={`${issue.type}-${index}`}>{issue.message}</li>)}</ul>}
  </section>;
}

export default function FigureComparisonPanel(props: FigureComparisonProps) {
  const [retry, setRetry] = useState(0);
  // Changed assets/specs own fresh load/consent state; old promises are ignored.
  const identity = JSON.stringify([props.figure.id, props.figure.original, props.figure.cleaned, props.figure.semanticSpec, retry]);
  return <><Comparison key={identity} {...props} /><button type="button" className="btn-secondary btn-sm" onClick={() => { props.onReady?.(false); setRetry(value => value + 1); }}>비교 이미지 다시 불러오기</button></>;
}
