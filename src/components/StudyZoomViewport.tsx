import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { writeUiStorageValue } from "../services/uiStorage";
import { ChevronDown, Eye, Minus, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";

interface StudyZoomViewportProps {
  storageKey: string;
  children: ReactNode;
}

const MIN_ZOOM = 70;
const MAX_ZOOM = 180;
const STEP = 10;
type ZoomDock = "left" | "right" | "bottom";

function controlsStorageKey(storageKey: string) { return `${storageKey}:controls`; }

function loadDock(storageKey: string): ZoomDock {
  const value = localStorage.getItem(controlsStorageKey(storageKey));
  return value === "left" || value === "bottom" ? value : "right";
}

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value / STEP) * STEP));
}

function loadZoom(storageKey: string): number {
  const saved = Number(localStorage.getItem(storageKey));
  return Number.isFinite(saved) ? clampZoom(saved) : 100;
}

export function getQuestionZoomStorageKey(entryId: string, mode: "paper" | "focus" | "theater" = "paper") {
  return `wrong-answer-question-zoom:${mode}:${entryId}`;
}

export default function StudyZoomViewport({ storageKey, children }: StudyZoomViewportProps) {
  const [zoom, setZoom] = useState(() => loadZoom(storageKey));
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [dock, setDock] = useState<ZoomDock>(() => loadDock(storageKey));

  useEffect(() => {
    setZoom(loadZoom(storageKey));
    setDock(loadDock(storageKey));
  }, [storageKey]);

  useEffect(() => {
    writeUiStorageValue(storageKey, String(zoom));
  }, [storageKey, zoom]);

  useEffect(() => {
    writeUiStorageValue(controlsStorageKey(storageKey), dock);
  }, [dock, storageKey]);

  const scale = useMemo(() => zoom / 100, [zoom]);

  const changeZoom = (delta: number) => {
    setZoom((current) => clampZoom(current + delta));
  };

  return (
    <div
      className="study-zoom-viewport"
      tabIndex={0}
      onWheel={(event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        changeZoom(event.deltaY < 0 ? STEP : -STEP);
      }}
      onKeyDown={(event) => {
        if (!event.ctrlKey) return;
        if (event.key === "0") {
          event.preventDefault();
          setZoom(100);
        } else if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          changeZoom(STEP);
        } else if (event.key === "-") {
          event.preventDefault();
          changeZoom(-STEP);
        }
      }}
      style={{ "--study-zoom-scale": String(scale) } as CSSProperties}
      aria-label="문제지 확대 축소 영역"
    >
      <div className="study-zoom-content">{children}</div>
      {hidden ? <button type="button" className="study-zoom-restore ui-icon-button" aria-label="줌 컨트롤 다시 표시" title="줌 컨트롤 다시 표시" onClick={() => setHidden(false)}><Eye size={18} /></button> : (
        <div className={`study-zoom-hud study-zoom-hud--${dock}${controlsOpen ? " is-open" : ""}`} aria-label="문제지 줌 조절">
          <button type="button" className="ui-icon-button" aria-expanded={controlsOpen} aria-label={controlsOpen ? "줌 조절 접기" : "줌 조절 열기"} title="확대·축소" onClick={() => setControlsOpen((open) => !open)}><SlidersHorizontal size={18} /></button>
          {controlsOpen && <div className="study-zoom-popover" role="group" aria-label="줌 설정">
            <span className="study-zoom-value">{zoom}%</span>
            <button type="button" className="ui-icon-button ui-icon-button--compact" onClick={() => changeZoom(-STEP)} disabled={zoom <= MIN_ZOOM} aria-label="문제지 축소"><Minus size={15} /></button>
            <button type="button" className="ui-icon-button ui-icon-button--compact" onClick={() => changeZoom(STEP)} disabled={zoom >= MAX_ZOOM} aria-label="문제지 확대"><Plus size={15} /></button>
            <button type="button" className="ui-icon-button ui-icon-button--compact" onClick={() => setZoom(100)} disabled={zoom === 100} aria-label="줌 초기화"><RotateCcw size={15} /></button>
            <button type="button" className="ui-icon-button ui-icon-button--compact" onClick={() => setDock((value) => value === "right" ? "bottom" : value === "bottom" ? "left" : "right")} aria-label="줌 컨트롤 위치 변경" title="위치 변경"><ChevronDown size={15} /></button>
            <button type="button" className="ui-icon-button ui-icon-button--compact" onClick={() => { setControlsOpen(false); setHidden(true); }} aria-label="줌 컨트롤 숨기기"><X size={15} /></button>
          </div>}
        </div>
      )}
    </div>
  );
}
