import { Children, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./ExamPaperCompositor.css";

export type ExamPaperLayout = "auto" | "single" | "columns";
export interface ExamPaperItem { id: string; node: ReactNode; groupId?: string; }
interface ExamPaperCompositorProps { enabled: boolean; children?: ReactNode; items?: ExamPaperItem[]; layout?: ExamPaperLayout; }
interface PaperPage { columns: ExamPaperItem[][]; }
const A4_CONTENT_HEIGHT = 1000;

function groupsFor(items: ExamPaperItem[]) {
  const groups: ExamPaperItem[][] = [];
  for (const item of items) {
    const previous = groups.at(-1);
    if (item.groupId && previous?.[0]?.groupId === item.groupId) previous.push(item);
    else groups.push([item]);
  }
  return groups;
}

function packPages(items: ExamPaperItem[], heights: Map<string, number>, columnCount: number): PaperPage[] {
  const pages: PaperPage[] = [];
  let columns: ExamPaperItem[][] = Array.from({ length: columnCount }, () => []);
  let used = Array.from({ length: columnCount }, () => 0);
  const pushPage = () => { if (columns.some((column) => column.length > 0)) pages.push({ columns }); columns = Array.from({ length: columnCount }, () => []); used = Array.from({ length: columnCount }, () => 0); };
  for (const group of groupsFor(items)) {
    const groupHeight = group.reduce((total, item) => total + (heights.get(item.id) ?? A4_CONTENT_HEIGHT), 0);
    let columnIndex = used.findIndex((value) => value + groupHeight <= A4_CONTENT_HEIGHT);
    if (columnIndex < 0) { pushPage(); columnIndex = 0; }
    columns[columnIndex].push(...group);
    used[columnIndex] += groupHeight;
    if (used[columnIndex] >= A4_CONTENT_HEIGHT) pushPage();
  }
  pushPage();
  return pages.length ? pages : [{ columns: Array.from({ length: columnCount }, () => []) }];
}

/** Hidden layout measurement produces the same reusable A4 page model for screen and print. */
export default function ExamPaperCompositor({ enabled, children, items: suppliedItems, layout = "auto" }: ExamPaperCompositorProps) {
  const items = useMemo<ExamPaperItem[]>(() => suppliedItems ?? Children.toArray(children).map((node, index) => ({ id: `item-${index}`, node })), [children, suppliedItems]);
  const measureRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Map<string, number>>(() => new Map());
  useLayoutEffect(() => {
    if (!enabled || !measureRef.current) return;
    const next = new Map<string, number>();
    for (const element of measureRef.current.querySelectorAll<HTMLElement>("[data-paper-measure-id]")) {
      const id = element.dataset.paperMeasureId;
      if (id) next.set(id, Math.max(1, Math.ceil(element.getBoundingClientRect().height)));
    }
    setHeights((current) => current.size === next.size && [...next].every(([id, height]) => current.get(id) === height) ? current : next);
  }, [enabled, items]);
  if (!enabled) return <>{items.map((item) => item.node)}</>;
  const resolvedLayout = layout === "auto" ? (typeof window !== "undefined" && window.innerWidth >= 1440 ? "columns" : "single") : layout;
  const columnCount = resolvedLayout === "columns" ? 2 : 1;
  const pages = packPages(items, heights, columnCount);
  return <>
    <div className={`exam-paper-compositor exam-paper-compositor--${resolvedLayout}`} data-layout={layout}>
      {pages.map((page, index) => <section className="exam-paper-page" key={`exam-page-${index}`} aria-label={`시험지 ${index + 1}페이지`}><div className="exam-paper-page__columns">{page.columns.map((column, columnIndex) => <div className="exam-paper-page__column" key={`exam-column-${index}-${columnIndex}`}>{column.map((item) => <div className="exam-paper-page__item" key={item.id}>{item.node}</div>)}</div>)}</div><footer className="exam-paper-page__number" aria-hidden="true">{index + 1}</footer></section>)}
    </div>
    <div className={`exam-paper-measure exam-paper-measure--${resolvedLayout}`} ref={measureRef} aria-hidden="true">{items.map((item) => <div key={item.id} data-paper-measure-id={item.id}>{item.node}</div>)}</div>
  </>;
}
