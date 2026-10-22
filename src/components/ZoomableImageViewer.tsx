import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { useImagePreviewResolver } from "../shared/ui/ImagePreviewContext";
import Dialog from "../shared/ui/Dialog";

const clampScale = (value: number) => Math.min(4, Math.max(0.01, value));
type Source = { filename: string; url?: string };

function ImageViewer({ filenames }: { filenames: string[] }) {
  const getImageUrl = useImagePreviewResolver();
  const filesKey = JSON.stringify(filenames);
  const [sources, setSources] = useState<Source[]>([]);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    let cancelled = false;
    const names: string[] = JSON.parse(filesKey);
    void Promise.all(names.map(async filename => {
      try { return { filename, url: await getImageUrl(filename) }; }
      catch { return { filename }; }
    })).then(items => { if (!cancelled) setSources(items); });
    return () => { cancelled = true; };
  }, [filesKey, getImageUrl, retry]);
  const reload = () => { setOpen(false); setSources([]); setFailed(new Set()); setRetry(value => value + 1); };
  const markFailed = (filename: string) => setFailed(value => new Set([...value, filename]));
  const current = sources[index];
  const error = (source: Source) => !source.url || failed.has(source.filename);
  const fitImage = () => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image?.naturalWidth || !image.naturalHeight) return;
    setScale(clampScale(Math.min((viewport.clientWidth - 48) / image.naturalWidth, (viewport.clientHeight - 48) / image.naturalHeight, 1)));
    setOffset({ x: 0, y: 0 });
  };
  const startDrag = (event: ReactPointerEvent<HTMLImageElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
  };
  const moveDrag = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (dragStart.current) setOffset({ x: dragStart.current.offsetX + event.clientX - dragStart.current.x, y: dragStart.current.offsetY + event.clientY - dragStart.current.y });
  };
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => { event.preventDefault(); setScale(value => clampScale(value + (event.deltaY < 0 ? 0.1 : -0.1))); };
  if (!filenames.length) return null;
  return <>
    {!sources.length && <p role="status">그림을 불러오는 중…</p>}
    <div className="zoom-viewer-launcher">{sources.map((source, sourceIndex) => error(source)
      ? <div key={source.filename} className="image-load-error" role="alert"><p>그림을 불러오지 못했습니다. 저장된 연결은 유지됩니다.</p><button type="button" className="btn-secondary" onClick={reload}>이미지 다시 불러오기</button></div>
      : <button key={`${source.filename}:${retry}`} type="button" onClick={() => { setIndex(sourceIndex); setScale(1); setOffset({ x: 0, y: 0 }); setOpen(true); }}><img src={source.url} alt={`첨부 이미지 ${sourceIndex + 1}`} onError={() => markFailed(source.filename)} /><span>확대 보기</span></button>)}</div>
    <Dialog open={open && Boolean(current)} onClose={() => setOpen(false)} className="zoom-viewer" backdropClassName="dialog-host" ariaLabel="이미지 확대 보기" scrollMode="custom" bodyClassName="zoom-viewer-body">
      <div className="zoom-viewer-shell" onKeyDown={event => {
        if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); setIndex(value => Math.max(0, Math.min(sources.length - 1, value + (event.key === "ArrowRight" ? 1 : -1)))); }
      }}>
        <div className="zoom-viewer-toolbar"><span>{index + 1} / {sources.length}</span><button type="button" onClick={() => setScale(value => clampScale(value - 0.25))}>축소</button><strong>{Math.round(scale * 100)}%</strong><button type="button" onClick={() => setScale(value => clampScale(value + 0.25))}>확대</button><button type="button" onClick={fitImage}>화면 맞춤</button><button type="button" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}>100%</button><button type="button" onClick={() => setOpen(false)}>닫기</button></div>
        <div className="zoom-viewer-viewport" ref={viewportRef} onWheel={handleWheel}>{current && (error(current) ? <div role="alert"><p>이미지 표시 중 오류가 발생했습니다.</p><button type="button" onClick={reload}>이미지 다시 불러오기</button></div> : <img key={`${current.filename}:${retry}`} ref={imageRef} src={current.url} alt={`확대 이미지 ${index + 1}`} draggable={false} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }} onLoad={fitImage} onError={() => markFailed(current.filename)} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { dragStart.current = null; }} onPointerCancel={() => { dragStart.current = null; }} />)}</div>
        {sources.length > 1 && <div className="zoom-viewer-navigation"><button type="button" disabled={index === 0} onClick={() => setIndex(value => value - 1)}>이전</button><button type="button" disabled={index === sources.length - 1} onClick={() => setIndex(value => value + 1)}>다음</button></div>}
      </div>
    </Dialog>
  </>;
}
export default function ZoomableImageViewer(props: { filenames: string[] }) { return <ImageViewer key={JSON.stringify(props.filenames)} {...props} />; }
