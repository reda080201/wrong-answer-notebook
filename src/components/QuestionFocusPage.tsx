import { useEffect, useMemo, useRef, useState } from "react";
import { isInteractivePaperTarget, type ExamPaperItem } from "./ExamPaperCompositor";
import type { PaperNavigationMode } from "./paperPagination";
import "./QuestionFocusPage.css";

interface Props {
  items: ExamPaperItem[];
  navigation?: PaperNavigationMode;
  title?: string;
  subject?: string;
  minutes?: number;
  currentQuestionNumber?: string;
  onQuestionChange?(number: string): void;
}

function buildSpreads(items: ExamPaperItem[]): ExamPaperItem[][] {
  const spreads: ExamPaperItem[][] = [];
  for (let index = 0; index < items.length;) {
    const item = items[index];
    if (item.groupId) {
      const group: ExamPaperItem[] = [];
      while (items[index + group.length]?.groupId === item.groupId) group.push(items[index + group.length]);
      spreads.push(group);
      index += group.length;
    } else {
      spreads.push(items.slice(index, index + 2));
      index += 2;
    }
  }
  return spreads;
}

export default function QuestionFocusPage({ items, navigation = "vertical-pages", title = "문제지", subject, minutes, currentQuestionNumber, onQuestionChange }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const spreads = useMemo(() => buildSpreads(items), [items]);
  const [selected, setSelected] = useState(currentQuestionNumber ?? items[0]?.questionNumber ?? items[0]?.id);
  const number = currentQuestionNumber ?? selected;
  const pageIndex = Math.max(0, spreads.findIndex(spread => spread.some(item => (item.questionNumber ?? item.id) === number)));
  const selectPage = (index: number) => {
    if (index < 0 || index >= spreads.length) return;
    const next = spreads[index][0];
    if (!next) return;
    const nextNumber = next.questionNumber ?? next.id;
    setSelected(nextNumber);
    onQuestionChange?.(nextNumber);
  };
  useEffect(() => {
    const target = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-focus-number]") ?? []).find(element => element.dataset.focusNumber === number);
    target?.scrollIntoView({ block: "start", inline: "nearest" });
  }, [number, pageIndex]);
  const controls = (position: string) => <nav className="question-focus-navigation" aria-label={`집중 보기 ${position} 이동`}><button type="button" onClick={() => selectPage(pageIndex - 1)} disabled={pageIndex === 0}>이전</button><span aria-live="polite">{spreads[pageIndex]?.map(item => item.questionNumber ?? item.id).join("–")} / {items.length}</span><button type="button" onClick={() => selectPage(pageIndex + 1)} disabled={pageIndex >= spreads.length - 1}>다음</button></nav>;
  return <div ref={root} className={`question-focus-reader question-focus-reader--${navigation}`} onKeyDown={event => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || isInteractivePaperTarget(event.target)) return;
    if (navigation === "horizontal-pages" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); selectPage(pageIndex + (event.key === "ArrowRight" ? 1 : -1)); }
  }} onTouchStart={event => {
    if (!isInteractivePaperTarget(event.target)) root.current?.setAttribute("data-touch-start", String(event.touches[0]?.clientX ?? ""));
  }} onTouchEnd={event => {
    const start = Number(root.current?.getAttribute("data-touch-start"));
    root.current?.removeAttribute("data-touch-start");
    if (!Number.isFinite(start) || isInteractivePaperTarget(event.target) || navigation !== "horizontal-pages") return;
    const delta = event.changedTouches[0]?.clientX - start;
    if (Math.abs(delta) > 70) selectPage(pageIndex + (delta < 0 ? 1 : -1));
  }}>
    {navigation === "horizontal-pages" && controls("상단")}
    <header className="question-focus-header"><p>{subject || "시험"} 영역 · {items.length}문항{minutes ? ` · ${minutes}분` : ""}</p><h2>{title}</h2></header>
    <div className="question-focus-spread-list">{spreads.map((spread, index) => <section key={spread.map(item => item.id).join("-")} className="question-focus-spread" hidden={navigation === "horizontal-pages" && index !== pageIndex} aria-label={`집중 보기 ${index + 1}페이지`}><div className="question-focus-columns">{spread.map(item => <div key={item.id} tabIndex={-1} data-focus-number={item.questionNumber ?? item.id} className="question-focus-item" aria-current={(item.questionNumber ?? item.id) === number ? "step" : undefined} onFocus={() => { setSelected(item.questionNumber ?? item.id); onQuestionChange?.(item.questionNumber ?? item.id); }}>{item.node}</div>)}</div><footer>{index + 1} / {spreads.length}</footer></section>)}</div>
    {navigation === "horizontal-pages" && controls("하단")}
  </div>;
}
