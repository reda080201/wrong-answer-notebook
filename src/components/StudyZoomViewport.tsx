import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, Eye, Minus, Move, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { writeUiStorageValue } from "../services/uiStorage";

interface StudyZoomViewportProps { storageKey: string; children: ReactNode; }
export interface StudyZoomControlsState { dock: "left" | "right" | "bottom"; offsetX: number; offsetY: number; hidden: boolean; }
export interface StudyZoomViewportHandle { restoreControls(): void; resetControls(): void; }

const MIN_ZOOM = 70;
const MAX_ZOOM = 180;
const STEP = 10;
const DEFAULT_CONTROLS: StudyZoomControlsState = { dock: "right", offsetX: 20, offsetY: 20, hidden: false };

function controlsStorageKey(storageKey: string) { return `${storageKey}:controls`; }
function clampZoom(value: number): number { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value / STEP) * STEP)); }
function loadZoom(storageKey: string): number { const saved = Number(localStorage.getItem(storageKey)); return Number.isFinite(saved) ? clampZoom(saved) : 100; }
function loadControls(storageKey: string): StudyZoomControlsState {
  try {
    const value = JSON.parse(localStorage.getItem(controlsStorageKey(storageKey)) ?? "null") as Partial<StudyZoomControlsState> | null;
    if (!value || (value.dock !== "left" && value.dock !== "right" && value.dock !== "bottom")) return DEFAULT_CONTROLS;
    return { dock: value.dock, offsetX: Math.max(0, Number.isFinite(value.offsetX) ? Number(value.offsetX) : 20), offsetY: Math.max(0, Number.isFinite(value.offsetY) ? Number(value.offsetY) : 20), hidden: value.hidden === true };
  } catch { return DEFAULT_CONTROLS; }
}

export function getQuestionZoomStorageKey(entryId: string, mode: "paper" | "focus" | "theater" = "paper") { return `wrong-answer-question-zoom:${mode}:${entryId}`; }
export function restoreStudyZoomControls(storageKey: string): void {
  window.dispatchEvent(new CustomEvent("wrong-answer:restore-study-zoom", { detail: storageKey }));
}

const StudyZoomViewport = forwardRef<StudyZoomViewportHandle, StudyZoomViewportProps>(function StudyZoomViewport({ storageKey, children }, ref) {
  const [zoom, setZoom] = useState(() => loadZoom(storageKey));
  const [controlsOpen, setControlsOpen] = useState(false);
  const [controls, setControls] = useState(() => loadControls(storageKey));
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => { setZoom(loadZoom(storageKey)); setControls(loadControls(storageKey)); setControlsOpen(false); }, [storageKey]);
  useEffect(() => { writeUiStorageValue(storageKey, String(zoom)); }, [storageKey, zoom]);
  useEffect(() => { writeUiStorageValue(controlsStorageKey(storageKey), JSON.stringify(controls)); }, [controls, storageKey]);
  useEffect(() => {
    const restore = (event: Event) => {
      if ((event as CustomEvent<string>).detail === storageKey) setControls((current) => ({ ...current, hidden: false }));
    };
    window.addEventListener("wrong-answer:restore-study-zoom", restore);
    return () => window.removeEventListener("wrong-answer:restore-study-zoom", restore);
  }, [storageKey]);
  useImperativeHandle(ref, () => ({ restoreControls: () => setControls((current) => ({ ...current, hidden: false })), resetControls: () => setControls(DEFAULT_CONTROLS) }), []);

  const scale = useMemo(() => zoom / 100, [zoom]);
  const changeZoom = (delta: number) => setZoom((current) => clampZoom(current + delta));
  const moveDock = () => setControls((current) => ({ ...current, dock: current.dock === "right" ? "bottom" : current.dock === "bottom" ? "left" : "right" }));
  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX: controls.offsetX, offsetY: controls.offsetY };
  };
  const drag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragRef.current;
    if (!start) return;
    setControls((current) => ({ ...current, offsetX: Math.max(0, Math.min(window.innerWidth - 44, start.offsetX + event.clientX - start.x)), offsetY: Math.max(0, Math.min(window.innerHeight - 44, start.offsetY + event.clientY - start.y)) }));
  };
  const hudStyle = controls.dock === "right" ? { right: controls.offsetX, bottom: controls.offsetY } : controls.dock === "left" ? { left: controls.offsetX, bottom: controls.offsetY } : { left: controls.offsetX, bottom: controls.offsetY };

  return <div className="study-zoom-viewport" tabIndex={0} onWheel={(event) => { if (!event.ctrlKey) return; event.preventDefault(); changeZoom(event.deltaY < 0 ? STEP : -STEP); }} onKeyDown={(event) => { if (!event.ctrlKey) return; if (event.key === "0") { event.preventDefault(); setZoom(100); } else if (event.key === "+" || event.key === "=") { event.preventDefault(); changeZoom(STEP); } else if (event.key === "-") { event.preventDefault(); changeZoom(-STEP); } }} style={{ "--study-zoom-scale": String(scale) } as CSSProperties} aria-label="문제지 확대 축소 영역">
    <div className="study-zoom-content">{children}</div>
    {!controls.hidden && <div className={`study-zoom-hud study-zoom-hud--${controls.dock}${controlsOpen ? " is-open" : ""}`} style={hudStyle} aria-label="문제지 줌 조절">
      <button type="button" className="ui-icon-button" aria-expanded={controlsOpen} aria-label={controlsOpen ? "줌 조절 접기" : "줌 조절 열기"} title="확대·축소" onClick={() => setControlsOpen((open) => !open)}><SlidersHorizontal size={18} /></button>
      {controlsOpen && <div className="study-zoom-popover" role="group" aria-label="줌 설정">
        <span className="study-zoom-value">{zoom}%</span>
        <button type="button" className="ui-icon-button ui-icon-button--compact" onClick={() => changeZoom(-STEP)} disabled={zoom <= MIN_ZOOM} aria-label="문제지 축소"><Minus size={15} /></button>
        <button type="button" className="ui-icon-button ui-icon-button--compact" onClick={() => changeZoom(STEP)} disabled={zoom >= MAX_ZOOM} aria-label="문제지 확대"><Plus size={15} /></button>
        <button type="button" className="ui-icon-button ui-icon-button--compact" onClick={() => setZoom(100)} disabled={zoom === 100} aria-label="줌 초기화"><RotateCcw size={15} /></button>
        <button type="button" className="ui-icon-button ui-icon-button--compact study-zoom-drag-handle" aria-label="줌 컨트롤 이동" title="드래그하여 위치 이동" onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={() => { dragRef.current = null; }}><Move size={15} /></button>
        <button type="button" className="ui-icon-button ui-icon-button--compact" onClick={moveDock} aria-label="줌 컨트롤 dock 변경" title="dock 변경"><ChevronDown size={15} /></button>
        <button type="button" className="ui-icon-button ui-icon-button--compact" onClick={() => setControls(DEFAULT_CONTROLS)} aria-label="줌 컨트롤 위치 초기화" title="위치 초기화"><Eye size={15} /></button>
        <button type="button" className="ui-icon-button ui-icon-button--compact" onClick={() => { setControlsOpen(false); setControls((current) => ({ ...current, hidden: true })); }} aria-label="줌 컨트롤 숨기기"><X size={15} /></button>
      </div>}
    </div>}
  </div>;
});

export default StudyZoomViewport;
