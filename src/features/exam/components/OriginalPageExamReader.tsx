import { useEffect, useMemo, useRef, useState } from "react";
import { getImageUrl } from "../../../api";
import "./OriginalPageExamReader.css";

interface Props {
  filenames: string[];
  selectedFilenames?: string[];
  currentFilename?: string;
  onSelectPages(filenames: string[]): void;
  onChangePage(filename: string): void;
}

const clampZoom = (zoom: number) => Math.min(2.5, Math.max(0.2, zoom));

export default function OriginalPageExamReader({ filenames, selectedFilenames, currentFilename, onSelectPages, onChangePage }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoomState, setZoomState] = useState({ mode: "width" as "width" | "page" | "manual", value: 1 });
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const selectedSet = useMemo(() => new Set(selectedFilenames ?? filenames), [filenames, selectedFilenames]);
  const visiblePages = useMemo(() => filenames.filter((filename) => selectedSet.has(filename)), [filenames, selectedSet]);
  const activeFilename = visiblePages.includes(currentFilename ?? "") ? currentFilename! : visiblePages[0];
  const activeIndex = Math.max(0, visiblePages.indexOf(activeFilename));
  const zoom = zoomState.value;
  const fitWidth = Math.max(0, viewportSize.width);
  const fitHeight = Math.max(0, viewportSize.height);
  const pageWidth = imageSize.width && imageSize.height
    ? Math.min(fitWidth, fitHeight * imageSize.width / imageSize.height)
    : fitWidth;
  const displayWidth = zoomState.mode === "page" ? pageWidth : zoomState.mode === "width" ? fitWidth : fitWidth * zoom;
  const displayedPercent = fitWidth > 0 ? Math.round(displayWidth / fitWidth * 100) : 100;
  const changeZoom = (update: (value: number) => number) => setZoomState(current => ({ mode: "manual", value: clampZoom(update(current.value)) }));

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(filenames.map(async (filename) => [filename, await getImageUrl(filename)] as const))
      .then((results) => {
        if (cancelled) return;
        const nextUrls: Record<string, string> = {};
        const nextFailures = new Set<string>();
        results.forEach((result, index) => {
          if (result.status === "fulfilled") nextUrls[result.value[0]] = result.value[1];
          else if (filenames[index]) nextFailures.add(filenames[index]);
        });
        setUrls(nextUrls);
        setFailedImages(nextFailures);
      });
    return () => { cancelled = true; };
  }, [filenames]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (activeFilename && activeFilename !== currentFilename) onChangePage(activeFilename);
  }, [activeFilename, currentFilename, onChangePage]);

  useEffect(() => {
    viewportRef.current?.scrollTo({ left: 0, top: 0 });
    setImageSize({ width: 0, height: 0 });
  }, [activeFilename]);

  const go = (nextIndex: number) => {
    const next = visiblePages[nextIndex];
    if (next) onChangePage(next);
  };
  const fitPage = () => setZoomState(current => ({ ...current, mode: "page" }));
  const fitToWidth = () => setZoomState(current => ({ ...current, mode: "width" }));

  if (!filenames.length) return <section className="original-page-empty" role="status"><h3>원본 문제지가 없습니다</h3><p>이 문제지에 페이지 전체 이미지가 연결되지 않았습니다. 문항 텍스트 보기로 계속 풀 수 있습니다.</p></section>;

  return <section className="original-page-reader" aria-label="원본 문제지 페이지 보기" onKeyDown={(event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing || (event.target instanceof Element && event.target.closest("button, input, textarea, select, summary, [contenteditable='true']"))) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); go(activeIndex - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); go(activeIndex + 1); }
  }} onTouchStart={(event) => {
    if (event.target instanceof Element && event.target.closest("button, input, textarea, select, summary, [role='checkbox'], [contenteditable='true']")) return;
    const point = event.touches[0];
    touchStart.current = point ? { x: point.clientX, y: point.clientY } : null;
  }} onTouchEnd={(event) => {
    const start = touchStart.current;
    touchStart.current = null;
    const point = event.changedTouches[0];
    if (!start || !point) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(activeIndex + (dx < 0 ? 1 : -1));
  }}>
    <header className="original-page-toolbar">
      <button type="button" onClick={() => go(activeIndex - 1)} disabled={activeIndex <= 0}>이전 페이지</button>
      <strong aria-live="polite">{visiblePages.length ? `${activeIndex + 1} / ${visiblePages.length} 페이지` : "페이지를 선택해 주세요"}</strong>
      <button type="button" onClick={() => go(activeIndex + 1)} disabled={activeIndex >= visiblePages.length - 1}>다음 페이지</button>
      <span className="original-page-toolbar__separator" aria-hidden="true" />
      <button type="button" onClick={() => changeZoom(value => value - 0.2)} disabled={zoom <= 0.2}>축소</button>
      <span>{displayedPercent}%</span>
      <button type="button" onClick={() => changeZoom(value => value + 0.2)} disabled={zoom >= 2.5}>확대</button>
      <button type="button" onClick={fitToWidth} aria-pressed={zoomState.mode === "width"}>너비 맞춤</button>
      <button type="button" onClick={fitPage} aria-pressed={zoomState.mode === "page"}>전체 맞춤</button>
    </header>
    <details className="original-page-selection">
      <summary>문제 페이지 선택 <span>{visiblePages.length} / {filenames.length}</span></summary>
      <p>문제지와 해설 페이지가 함께 들어 있다면 풀이에 사용할 문제 페이지만 선택하세요.</p>
      <div className="original-page-selection-actions"><button type="button" onClick={() => onSelectPages([...filenames])}>모두 선택</button><button type="button" onClick={() => onSelectPages([])}>모두 해제</button></div>
      <div className="original-page-thumbnails">
        {filenames.map((filename, index) => <label key={filename} className={selectedSet.has(filename) ? "is-selected" : ""}>
          <input type="checkbox" checked={selectedSet.has(filename)} onChange={(event) => {
            const next = new Set(selectedSet);
            if (event.target.checked) next.add(filename); else next.delete(filename);
            onSelectPages(filenames.filter((page) => next.has(page)));
          }} />
          <span>페이지 {index + 1}</span>
          {urls[filename] && <img src={urls[filename]} alt={`페이지 ${index + 1} 미리보기`} loading="lazy" />}
        </label>)}
      </div>
    </details>
    <div ref={viewportRef} className="original-page-viewport" tabIndex={0} aria-label="원본 페이지. 좌우 방향키로 넘길 수 있습니다.">
      {!activeFilename ? <div className="original-page-no-selection" role="status"><h3>표시할 문제 페이지를 선택하세요</h3><p>페이지 선택을 펼쳐 풀이에 사용할 페이지를 고르세요.</p><button type="button" onClick={() => onSelectPages([...filenames])}>모든 페이지 표시</button></div> : failedImages.has(activeFilename) ? <p role="alert">이 페이지를 불러오지 못했습니다. 다른 페이지는 계속 볼 수 있습니다. 문항 텍스트 보기에서 계속 풀 수도 있습니다.</p> : urls[activeFilename] ? <img className="original-page-image" src={urls[activeFilename]} alt={`원본 문제지 페이지 ${filenames.indexOf(activeFilename) + 1}`} draggable={false} style={{ width: `${displayWidth}px` }} onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailedImages(current => new Set(current).add(activeFilename))} /> : <p role="status">원본 페이지를 불러오는 중…</p>}
    </div>
  </section>;
}
