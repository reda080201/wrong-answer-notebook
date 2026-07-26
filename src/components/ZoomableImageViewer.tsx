import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { getImageUrl } from "../api";
import Dialog from "../shared/ui/Dialog";

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export default function ZoomableImageViewer({ filenames }: { filenames: string[] }) {
  const [sources, setSources] = useState<Array<{ filename: string; url: string }>>([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(filenames.map(async (filename) => ({ filename, url: await getImageUrl(filename) })))
      .then((items) => {
        if (!cancelled) setSources(items);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => { cancelled = true; };
  }, [filenames]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
      if (event.key === "ArrowRight") setIndex((value) => Math.min(sources.length - 1, value + 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, sources.length]);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [index]);

  if (!sources.length) return null;
  const current = sources[index];

  const fitImage = () => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image || !image.naturalWidth || !image.naturalHeight) return;
    const next = Math.min(
      (viewport.clientWidth - 48) / image.naturalWidth,
      (viewport.clientHeight - 48) / image.naturalHeight,
      1,
    );
    setScale(clampScale(next));
    setOffset({ x: 0, y: 0 });
  };

  const startDrag = (event: ReactPointerEvent<HTMLImageElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (!dragStart.current) return;
    setOffset({
      x: dragStart.current.offsetX + event.clientX - dragStart.current.x,
      y: dragStart.current.offsetY + event.clientY - dragStart.current.y,
    });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setScale((value) => clampScale(value + (event.deltaY < 0 ? 0.1 : -0.1)));
  };

  return (
    <>
      <div className="zoom-viewer-launcher">
        {sources.map((source, sourceIndex) => (
          <button key={source.filename} type="button" onClick={() => { setIndex(sourceIndex); setOpen(true); }}>
            <img src={source.url} alt={`첨부 이미지 ${sourceIndex + 1}`} />
            <span>확대 보기</span>
          </button>
        ))}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} className="zoom-viewer" backdropClassName="dialog-host" ariaLabel="이미지 확대 보기">
          <div className="zoom-viewer-toolbar">
            <span>{index + 1} / {sources.length}</span>
            <button type="button" onClick={() => setScale((value) => clampScale(value - 0.25))}>축소</button>
            <strong>{Math.round(scale * 100)}%</strong>
            <button type="button" onClick={() => setScale((value) => clampScale(value + 0.25))}>확대</button>
            <button type="button" onClick={fitImage}>화면 맞춤</button>
            <button type="button" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}>100%</button>
            <button type="button" onClick={() => setOpen(false)}>닫기</button>
          </div>
          <div className="zoom-viewer-viewport" ref={viewportRef} onWheel={handleWheel}>
            <img
              ref={imageRef}
              src={current.url}
              alt={`확대 이미지 ${index + 1}`}
              draggable={false}
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={() => { dragStart.current = null; }}
              onPointerCancel={() => { dragStart.current = null; }}
            />
          </div>
          {sources.length > 1 && (
            <div className="zoom-viewer-navigation">
              <button type="button" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>이전</button>
              <button type="button" disabled={index === sources.length - 1} onClick={() => setIndex((value) => value + 1)}>다음</button>
            </div>
          )}
      </Dialog>
    </>
  );
}
