import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { writeUiStorageValue } from "../services/uiStorage";

interface StudyZoomViewportProps {
  storageKey: string;
  children: ReactNode;
}

const MIN_ZOOM = 70;
const MAX_ZOOM = 180;
const STEP = 10;

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

  useEffect(() => {
    setZoom(loadZoom(storageKey));
  }, [storageKey]);

  useEffect(() => {
    writeUiStorageValue(storageKey, String(zoom));
  }, [storageKey, zoom]);

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
      <div className="study-zoom-hud" aria-label="문제지 줌 조절">
        <span>{zoom}%</span>
        <button type="button" onClick={() => changeZoom(-STEP)} disabled={zoom <= MIN_ZOOM} aria-label="문제지 축소">
          -
        </button>
        <button type="button" onClick={() => changeZoom(STEP)} disabled={zoom >= MAX_ZOOM} aria-label="문제지 확대">
          +
        </button>
        <button type="button" onClick={() => setZoom(100)} disabled={zoom === 100}>
          초기화
        </button>
      </div>
    </div>
  );
}
