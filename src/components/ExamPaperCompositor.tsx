import { Children, cloneElement, isValidElement, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./ExamPaperCompositor.css";

export type ExamPaperLayout = "auto" | "single" | "columns";
export interface ExamPaperItem { id: string; node: ReactNode; groupId?: string; }
interface ExamPaperCompositorProps { enabled: boolean; children?: ReactNode; items?: ExamPaperItem[]; layout?: ExamPaperLayout; }
interface PaperPage { columns: ExamPaperItem[][]; oversized?: boolean; }
const A4_CONTENT_HEIGHT = 985;

function withoutDomIds(node: ReactNode): ReactNode {
  if (!isValidElement<{ id?: string; children?: ReactNode }>(node)) return node;
  const children = node.props.children === undefined ? undefined : Children.map(node.props.children, withoutDomIds);
  return cloneElement(node, { id: undefined }, children);
}

function groupsFor(items: ExamPaperItem[]) {
  const groups: ExamPaperItem[][] = [];
  for (const item of items) {
    const previous = groups.at(-1);
    if (item.groupId && previous?.[0]?.groupId === item.groupId) previous.push(item);
    else groups.push([item]);
  }
  return groups;
}

function packPages(items: ExamPaperItem[], heights: Map<string, number>, columnCount: 1 | 2): PaperPage[] {
  const pages: PaperPage[] = [];
  let current: ExamPaperItem[][] = Array.from({ length: columnCount }, () => []);
  let column = 0;
  let used = 0;
  for (const group of groupsFor(items)) {
    const groupHeight = group.reduce((total, item) => total + (heights.get(item.id) ?? A4_CONTENT_HEIGHT), 0);
    // A passage group is measured at the actual target column width. If it is
    // taller than a printable column, it receives its own expanding surface
    // rather than being clipped or overlapping the next A4 page.
    if (groupHeight > A4_CONTENT_HEIGHT) {
      if (current.some((itemsInColumn) => itemsInColumn.length)) pages.push({ columns: current });
      pages.push({ columns: [group], oversized: true });
      current = Array.from({ length: columnCount }, () => []);
      column = 0;
      used = 0;
      continue;
    }
    if (current[column].length > 0 && used + groupHeight > A4_CONTENT_HEIGHT) {
      column += 1;
      used = 0;
      if (column >= columnCount) { pages.push({ columns: current }); current = Array.from({ length: columnCount }, () => []); column = 0; }
    }
    current[column].push(...group); used += groupHeight;
    if (used >= A4_CONTENT_HEIGHT) {
      column += 1;
      used = 0;
      if (column >= columnCount) { pages.push({ columns: current }); current = Array.from({ length: columnCount }, () => []); column = 0; }
    }
  }
  if (current.some((itemsInColumn) => itemsInColumn.length)) pages.push({ columns: current });
  return pages.length ? pages : [{ columns: Array.from({ length: columnCount }, () => []) }];
}

/** Hidden layout measurement produces the same reusable A4 page model for screen and print. */
export default function ExamPaperCompositor({ enabled, children, items: suppliedItems, layout = "auto" }: ExamPaperCompositorProps) {
  const items = useMemo<ExamPaperItem[]>(() => suppliedItems ?? Children.toArray(children).map((node, index) => ({ id: `item-${index}`, node })), [children, suppliedItems]);
  const measureRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Map<string, number>>(() => new Map());
  const resolvedLayout = layout === "auto" ? (typeof window !== "undefined" && window.innerWidth >= 1440 ? "columns" : "single") : layout;
  const columnCount = resolvedLayout === "columns" ? 2 : 1;
  useLayoutEffect(() => {
    if (!enabled || !measureRef.current) return;
    // Composite children can create IDs internally; measurement DOM must never
    // participate in navigation target lookup.
    for (const element of measureRef.current.querySelectorAll<HTMLElement>("[id]")) element.removeAttribute("id");
    const next = new Map<string, number>();
    for (const element of measureRef.current.querySelectorAll<HTMLElement>("[data-paper-measure-id]")) {
      const id = element.dataset.paperMeasureId;
      if (id) next.set(id, Math.max(1, Math.ceil(element.getBoundingClientRect().height)));
    }
    setHeights((current) => current.size === next.size && [...next].every(([id, height]) => current.get(id) === height) ? current : next);
  }, [enabled, items, resolvedLayout]);
  if (!enabled) return <>{items.map((item) => item.node)}</>;
  const pages = packPages(items, heights, columnCount);
  return <>
    <div className={`exam-paper-compositor exam-paper-compositor--${resolvedLayout}`} data-layout={layout}>
      {pages.map((page, index) => <section className={`exam-paper-page${page.oversized ? " exam-paper-page--oversized" : ""}`} key={`exam-page-${index}`} aria-label={`시험지 ${index + 1}페이지`}><div className="exam-paper-page__columns">{page.columns.map((columnItems, columnIndex) => <div className="exam-paper-page__column" key={`exam-page-${index}-column-${columnIndex}`}>{columnItems.map((item) => <div className="exam-paper-page__item" key={item.id}>{item.node}</div>)}</div>)}</div><footer className="exam-paper-page__number" aria-hidden="true">{index + 1}</footer></section>)}
    </div>
    <div className={`exam-paper-measure exam-paper-measure--${resolvedLayout}`} ref={measureRef} aria-hidden="true">{items.map((item) => <div key={item.id} data-paper-measure-id={item.id}>{withoutDomIds(item.node)}</div>)}</div>
  </>;
}
