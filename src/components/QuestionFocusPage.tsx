import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isInteractivePaperTarget, type ExamPaperItem } from "./ExamPaperCompositor";
import "./QuestionFocusPage.css";

export interface QuestionFocusItem extends ExamPaperItem {
  stimulusNode?: ReactNode;
  stimulusIncluded?: boolean;
}

export interface FocusSpread {
  id: string;
  items: QuestionFocusItem[];
  repeatedStimulus?: ReactNode;
}

interface Props {
  items: QuestionFocusItem[];
  title?: string;
  subject?: string;
  minutes?: number;
  currentQuestionNumber?: string;
  onActivateQuestion?(number: string): void;
  onNavigateQuestion?(number: string): void;
}

export function buildFocusSpreads(items: QuestionFocusItem[], narrow = false): FocusSpread[] {
  const spreads: FocusSpread[] = [];
  for (let index = 0; index < items.length;) {
    const item = items[index];
    if (item.groupId) {
      const group: QuestionFocusItem[] = [];
      while (items[index + group.length]?.groupId === item.groupId) group.push(items[index + group.length]);
      for (let offset = 0; offset < group.length; offset += narrow ? 1 : 2) {
        const chunk = group.slice(offset, offset + (narrow ? 1 : 2));
        spreads.push({ id: chunk.map(entry => entry.id).join("-"), items: chunk, repeatedStimulus: item.stimulusNode });
      }
      index += group.length;
    } else {
      const chunk = items.slice(index, index + (narrow ? 1 : 2));
      spreads.push({ id: chunk.map(entry => entry.id).join("-"), items: chunk });
      index += chunk.length;
    }
  }
  return spreads;
}

export default function QuestionFocusPage({ items, title = "문제지", subject, minutes, currentQuestionNumber, onActivateQuestion, onNavigateQuestion }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const touch = useRef<{ startX: number; startY: number; startedInteractive: boolean } | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => setNarrow(element.clientWidth <= 1100);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const spreads = useMemo(() => buildFocusSpreads(items, narrow), [items, narrow]);
  const [selected, setSelected] = useState(currentQuestionNumber ?? items[0]?.questionNumber ?? items[0]?.id);
  const number = currentQuestionNumber ?? selected;
  const pageIndex = Math.max(0, spreads.findIndex(spread => spread.items.some(item => (item.questionNumber ?? item.id) === number)));
  const selectPage = (index: number) => {
    if (index < 0 || index >= spreads.length) return;
    const next = spreads[index].items[0];
    if (!next) return;
    const nextNumber = next.questionNumber ?? next.id;
    setSelected(nextNumber);
    onNavigateQuestion?.(nextNumber);
  };
  useEffect(() => {
    const target = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-focus-number]") ?? []).find(element => element.dataset.focusNumber === number);
    if (target && pageIndex > 0) target.scrollIntoView({ block: "start", inline: "nearest" });
  }, [pageIndex, number]);
  const controls = <nav className="question-focus-navigation" aria-label="집중 보기 페이지 이동"><button type="button" onClick={() => selectPage(pageIndex - 1)} disabled={pageIndex === 0}>이전</button><span aria-live="polite">{spreads[pageIndex]?.items.map(item => item.questionNumber ?? item.id).join("–")} / {items.length}</span><button type="button" onClick={() => selectPage(pageIndex + 1)} disabled={pageIndex >= spreads.length - 1}>다음</button></nav>;
  return <div ref={root} className="question-focus-reader" onKeyDown={event => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || isInteractivePaperTarget(event.target)) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); selectPage(pageIndex + (event.key === "ArrowRight" ? 1 : -1)); }
  }} onTouchStart={event => {
    const point = event.touches[0];
    touch.current = point ? { startX: point.clientX, startY: point.clientY, startedInteractive: isInteractivePaperTarget(event.target) } : null;
  }} onTouchCancel={() => { touch.current = null; }} onTouchEnd={event => {
    const start = touch.current;
    touch.current = null;
    const point = event.changedTouches[0];
    if (!start || start.startedInteractive || !point || isInteractivePaperTarget(event.target)) return;
    const deltaX = point.clientX - start.startX;
    const deltaY = point.clientY - start.startY;
    if (Math.abs(deltaX) >= 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) selectPage(pageIndex + (deltaX < 0 ? 1 : -1));
  }}>
    {controls}
    <header className="question-focus-header"><p>{subject || "시험"} 영역 · {items.length}문항{minutes ? ` · ${minutes}분` : ""}</p><h2>{title}</h2></header>
    <div className="question-focus-spread-list">{spreads.map((spread, index) => <section key={spread.id} className="question-focus-spread" hidden={index !== pageIndex} aria-label={`집중 보기 ${index + 1}페이지`}><div className={`question-focus-columns${spread.items.length === 1 ? " question-focus-columns--single" : ""}`}>{spread.items.map(item => <div key={item.id} tabIndex={-1} data-focus-number={item.questionNumber ?? item.id} className="question-focus-item" aria-current={(item.questionNumber ?? item.id) === number ? "step" : undefined} onClick={() => onActivateQuestion?.(item.questionNumber ?? item.id)}>{spread.repeatedStimulus && !item.stimulusIncluded && <div className="question-focus-stimulus">{spread.repeatedStimulus}</div>}{item.node}</div>)}</div><footer>{spread.items.map(item => item.questionNumber ?? item.id).join("–")} / {items.length}</footer></section>)}</div>
    {controls}
  </div>;
}
