import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface ExamPaperPagerItem {
  id: string;
  node: ReactNode;
  groupId?: string;
}

interface ExamPaperPagerProps {
  items: ExamPaperPagerItem[];
}

function makeSpreads(items: ExamPaperPagerItem[]): ExamPaperPagerItem[][] {
  const spreads: ExamPaperPagerItem[][] = [];
  let index = 0;
  while (index < items.length) {
    const groupId = items[index].groupId;
    if (groupId) {
      let end = index + 1;
      while (end < items.length && items[end].groupId === groupId) end += 1;
      const group = items.slice(index, end);
      if (group.length <= 2) spreads.push(group);
      else for (let offset = 0; offset < group.length; offset += 2) spreads.push(group.slice(offset, offset + 2));
      index = end;
      continue;
    }
    spreads.push(items.slice(index, index + 2));
    index += 2;
  }
  return spreads.length ? spreads : [[]];
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, button, [contenteditable='true'], [role='dialog']"));
}

export default function ExamPaperPager({ items }: ExamPaperPagerProps) {
  const spreads = useMemo(() => makeSpreads(items), [items]);
  const [pageIndex, setPageIndex] = useState(0);
  const pagerRef = useRef<HTMLElement>(null);
  const hasMountedRef = useRef(false);
  const page = Math.min(pageIndex, Math.max(0, spreads.length - 1));
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    requestAnimationFrame(() => pagerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [page]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); setPageIndex((current) => Math.max(0, current - 1)); }
      if (event.key === "ArrowRight") { event.preventDefault(); setPageIndex((current) => Math.min(spreads.length - 1, current + 1)); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [spreads.length]);
  const current = spreads[page] ?? [];
  return <section ref={pagerRef} className="exam-paper-pager" aria-label="2문항 펼침" data-page={page + 1}>
    <nav className="exam-paper-pager__navigation" aria-label="시험지 페이지 이동">
      <button type="button" onClick={() => setPageIndex((value) => Math.max(0, value - 1))} disabled={page === 0}>이전</button>
      <span aria-live="polite">{page + 1} / {spreads.length}</span>
      <button type="button" onClick={() => setPageIndex((value) => Math.min(spreads.length - 1, value + 1))} disabled={page >= spreads.length - 1}>다음</button>
    </nav>
    <div className="exam-paper-pager__spread">{current.map((item) => <article className="exam-paper-pager__item" key={item.id}>{item.node}</article>)}</div>
  </section>;
}
