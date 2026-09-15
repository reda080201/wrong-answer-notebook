import { Children, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { paginatePaper, PAPER_WIDTH, PAPER_PADDING, PAPER_COLUMN_WIDTH, type PaperNavigationMode, type PaperPageItem } from "./paperPagination";
import "./ExamPaperCompositor.css";

export type ExamPaperLayout = "auto" | "single" | "columns";
export interface ExamPaperItem extends PaperPageItem { node: ReactNode }
interface Props {
  enabled: boolean; children?: ReactNode; items?: ExamPaperItem[]; layout?: ExamPaperLayout;
  navigation?: PaperNavigationMode; title?: string; subject?: string; minutes?: number;
  showHeader?: boolean; showPageNumbers?: boolean;
  currentQuestionNumber?: string; onQuestionChange?(number: string): void;
}
const INTERACTIVE_PAPER_TARGETS = "button, a[href], input, textarea, select, summary, [contenteditable], [role='button'], [role='radio'], [role='checkbox'], [role='option'], [role='listbox'], [role='menu'], [role='dialog']";

export function isInteractivePaperTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_PAPER_TARGETS));
}
export default function ExamPaperCompositor({ enabled, children, items: suppliedItems, layout = "columns", navigation = "vertical-pages", title = "문제지", subject, minutes, showHeader = true, showPageNumbers = true, currentQuestionNumber, onQuestionChange }: Props) {
  const items = useMemo<ExamPaperItem[]>(() => suppliedItems ?? Children.toArray(children).map((node, index) => ({ id: `item-${index}`, node })), [children, suppliedItems]);
  const root = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [measurements, setMeasurements] = useState(() => ({ narrow: new Map<string, number>(), wide: new Map<string, number>() }));
  const lastNavigation = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const number = currentQuestionNumber ?? selected ?? items[0]?.questionNumber ?? items[0]?.id;
  const pages = useMemo(() => paginatePaper(items, measurements.narrow, measurements.wide, layout === "single" ? 1 : 2, showHeader ? 108 : 0), [items, measurements, layout, showHeader]);
  const pageIndex = Math.max(0, pages.findIndex(page => page.questionNumbers.includes(number ?? "")));
  useLayoutEffect(() => {
    const container = root.current;
    if (!enabled || !container) return;
    let cancelled = false, frame = 0;
    // DOM clones do not mount another React editor, image subscription, or target ID.
    const measure = () => {
      if (cancelled) return;
      const next = { narrow: new Map<string, number>(), wide: new Map<string, number>() };
      const host = container.ownerDocument.createElement("div");
      host.className = "exam-paper-measure";
      host.inert = true;
      host.setAttribute("aria-hidden", "true");
      container.append(host);
      for (const item of container.querySelectorAll<HTMLElement>("[data-paper-item]")) {
        const id = item.dataset.paperItem!;
        const clone = item.cloneNode(true) as HTMLElement;
        clone.removeAttribute("data-paper-item");
        for (const element of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) {
          element.removeAttribute("id"); element.removeAttribute("autofocus"); element.removeAttribute("name"); element.removeAttribute("aria-current");
        }
        host.replaceChildren(clone);
        host.style.width = `${layout === "single" ? PAPER_WIDTH - 2 * PAPER_PADDING : PAPER_COLUMN_WIDTH}px`;
        next.narrow.set(id, clone.offsetHeight || Math.ceil(clone.getBoundingClientRect().height));
        host.style.width = `${PAPER_WIDTH - 2 * PAPER_PADDING}px`;
        next.wide.set(id, clone.offsetHeight || Math.ceil(clone.getBoundingClientRect().height));
      }
      host.remove();
      setMeasurements(previous => (["narrow", "wide"] as const).every(key => previous[key].size === next[key].size && [...next[key]].every(([id, height]) => previous[key].get(id) === height)) ? previous : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    container.querySelectorAll<HTMLElement>("[data-paper-item]").forEach(element => observer?.observe(element));
    container.addEventListener("load", schedule, true);
    void container.ownerDocument.fonts?.ready.then(() => { if (!cancelled) schedule(); });
    return () => { cancelled = true; cancelAnimationFrame(frame); observer?.disconnect(); container.removeEventListener("load", schedule, true); };
  }, [enabled, items, layout]);
  useLayoutEffect(() => {
    const container = root.current;
    if (!container || !enabled) return;
    const resize = () => container.style.setProperty("--paper-scale", String(Math.min(1.25, Math.max(0.25, container.clientWidth / PAPER_WIDTH))));
    resize();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize);
    observer?.observe(container);
    return () => observer?.disconnect();
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const key = `${navigation}:${number}`;
    if (lastNavigation.current === key) return;
    const initial = lastNavigation.current === null;
    lastNavigation.current = key;
    if (initial && number === (items[0]?.questionNumber ?? items[0]?.id)) return;
    const frame = requestAnimationFrame(() => {
      const item = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-paper-number]") ?? []).find(element => element.dataset.paperNumber === number);
      if (!item) return;
      item.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (document.activeElement === document.body) item.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, number, navigation, pageIndex, items]);
  const go = (index: number) => {
    if (index < 0 || index >= pages.length) return;
    const next = pages[index].questionNumbers[0];
    if (!next) return;
    setSelected(next); onQuestionChange?.(next);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-paper-page="${index + 1}"]`)?.scrollIntoView({ block: "start" }));
  };
  const controls = (position: string) => <nav className="exam-paper-pager__navigation" aria-label={`시험지 페이지 ${position} 이동`}><button type="button" onClick={() => go(pageIndex - 1)} disabled={pageIndex === 0}>이전 페이지</button><span aria-live="polite">{pageIndex + 1} / {pages.length}</span><button type="button" onClick={() => go(pageIndex + 1)} disabled={pageIndex === pages.length - 1}>다음 페이지</button></nav>;
  if (!enabled) return <>{items.map(item => <div key={item.id}>{item.node}</div>)}</>;
  const byId = new Map(items.map(item => [item.id, item]));
  return <div ref={root} className={`exam-paper-reader exam-paper-reader--${navigation}`} data-layout={layout}
    onKeyDown={event => {
      if (navigation !== "horizontal-pages" || event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || isInteractivePaperTarget(event.target)) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); go(pageIndex + (event.key === "ArrowLeft" ? -1 : 1)); }
    }}
    onTouchStart={event => { touch.current = null; if (navigation === "horizontal-pages" && !isInteractivePaperTarget(event.target)) touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
    onTouchEnd={event => { const start = touch.current; touch.current = null; if (!start || navigation !== "horizontal-pages" || isInteractivePaperTarget(event.target)) return; const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(pageIndex + (dx < 0 ? 1 : -1)); }}>
    {navigation === "horizontal-pages" && controls("상단")}
    <div className="exam-paper-compositor">
      {pages.map((page, index) => <section key={page.id} className={`exam-paper-page${page.oversized ? " exam-paper-page--oversized" : ""}${page.fullWidth ? " exam-paper-page--full" : ""}`} data-paper-page={index + 1} hidden={navigation === "horizontal-pages" && index !== pageIndex} aria-label={`시험지 ${index + 1}페이지`}>
        {showHeader && index === 0 && <header className="exam-paper-title"><p>{subject || "시험"} 영역 · {items.length}문항{minutes ? ` · ${minutes}분` : ""}</p><h2>{title}</h2><div>성명 __________ 수험번호 __________</div></header>}
        <div className="exam-paper-page__columns" style={{ gridTemplateColumns: page.columns.length === 2 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" }}>
          {page.columns.map((column, columnIndex) => <div key={columnIndex} className="exam-paper-page__column">{column?.items.map(item => <div key={item.id} tabIndex={-1} data-paper-item={item.id} data-paper-number={item.questionNumber ?? item.id} aria-current={(item.questionNumber ?? item.id) === number ? "step" : undefined} className="exam-paper-page__item" onFocus={() => { setSelected(item.questionNumber ?? item.id); onQuestionChange?.(item.questionNumber ?? item.id); }}>{byId.get(item.id)?.node}</div>)}</div>)}
        </div>{showPageNumbers && <footer className="exam-paper-page__number">{index + 1} / {pages.length}</footer>}
      </section>)}
    </div>{navigation === "horizontal-pages" && controls("하단")}
  </div>;
}
