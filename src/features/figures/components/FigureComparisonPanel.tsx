import { useEffect, useState } from "react";
import { getImageUrl } from "../../../api";
import type { SheetFigureItem } from "../../../types";
import SemanticFigureView from "./SemanticFigureView";

interface Props { figure: SheetFigureItem; onReady?: (ready: boolean) => void; }

export default function FigureComparisonPanel({ figure, onReady }: Props) {
  const [urls, setUrls] = useState<{ original?: string; cleaned?: string }>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [originalLoaded, setOriginalLoaded] = useState(false);
  const [cleanedLoaded, setCleanedLoaded] = useState(false);
  const [semanticRendered, setSemanticRendered] = useState(false);
  const [userConfirmedComparison, setUserConfirmedComparison] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [opacity, setOpacity] = useState(0.5);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      figure.original?.image ? getImageUrl(figure.original.image).then((url) => ["original", url] as const) : Promise.resolve(undefined),
      figure.cleaned?.image ? getImageUrl(figure.cleaned.image).then((url) => ["cleaned", url] as const) : Promise.resolve(undefined),
    ]).then((items) => {
      if (cancelled) return;
      const entries = items.filter((item): item is ["original" | "cleaned", string] => Boolean(item));
      setUrls(Object.fromEntries(entries) as typeof urls);
    }).catch(() => { if (!cancelled) setFailed(["image"]); });
    return () => { cancelled = true; };
  }, [figure.cleaned?.image, figure.original?.image]);

  const hasImage = Boolean(urls.original || urls.cleaned);
  const cleanedComparisonLoaded = !urls.cleaned || Boolean(urls.original && originalLoaded && cleanedLoaded);
  const representationsLoaded = (!urls.original || originalLoaded) && cleanedComparisonLoaded && (!figure.semanticSpec || semanticRendered);
  const comparisonReady = representationsLoaded && userConfirmedComparison;
  useEffect(() => { onReady?.(comparisonReady); }, [comparisonReady, onReady]);
  useEffect(() => {
    setOriginalLoaded(false);
    setCleanedLoaded(false);
    setSemanticRendered(false);
    setUserConfirmedComparison(false);
    setUrls({});
    setFailed([]);
  }, [figure.id, figure.cleaned?.image, figure.original?.image, figure.semanticSpec]);
  useEffect(() => {
    if (figure.semanticSpec) setSemanticRendered(true);
  }, [figure.semanticSpec]);
  return <section className="figure-comparison" aria-label={`${figure.questionNumber || "문항"}번 그림 비교`}>
    <div className="figure-comparison-grid">
      <figure><figcaption>원본 crop</figcaption>{urls.original ? <img src={urls.original} alt="원본 도형 crop" onLoad={() => setOriginalLoaded(true)} onError={() => { setOriginalLoaded(false); setFailed((items) => [...new Set([...items, "original"])]); }} /> : <p>{failed.includes("original") ? "원본 이미지를 읽지 못했습니다." : "원본 없음"}</p>}</figure>
      <figure><figcaption>GPT 정리본</figcaption>{urls.cleaned ? <img src={urls.cleaned} alt="GPT 정리 도형" onLoad={() => setCleanedLoaded(true)} onError={() => { setCleanedLoaded(false); setFailed((items) => [...new Set([...items, "cleaned"])]); }} /> : <p>정리본 없음</p>}</figure>
      {figure.semanticSpec ? <div><figcaption>구조 렌더링</figcaption><div><SemanticFigureView spec={figure.semanticSpec} title={figure.title} /></div></div> : null}
    </div>
    {hasImage && urls.original && urls.cleaned ? <div className="figure-comparison-overlay">
      <button type="button" onClick={() => setOverlay((value) => !value)} aria-pressed={overlay}>{overlay ? "겹쳐보기 끄기" : "겹쳐보기"}</button>
      {overlay ? <label>투명도 <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label> : null}
      {overlay ? <div className="figure-comparison-stack"><img src={urls.original} alt="원본 겹쳐보기" /><img src={urls.cleaned} alt="정리본 겹쳐보기" style={{ opacity }} /></div> : null}
    </div> : null}
    <label className="figure-comparison-confirm"><input type="checkbox" checked={userConfirmedComparison} disabled={!representationsLoaded} onChange={(event) => setUserConfirmedComparison(event.target.checked)} /> 원본과 정리본을 비교했습니다</label>
    {figure.verification && <ul className="figure-comparison-issues">{[...figure.verification.blockingIssues, ...figure.verification.warnings].map((issue, index) => <li key={`${issue.type}-${index}`}>{issue.message}</li>)}</ul>}
  </section>;
}
