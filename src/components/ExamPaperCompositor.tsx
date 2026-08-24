import type { ReactNode } from "react";

interface ExamPaperCompositorProps {
  enabled: boolean;
  children: ReactNode[];
  itemsPerPage?: number;
}

/** Shared screen/print page surface for exam mode. The question renderer stays unchanged. */
export default function ExamPaperCompositor({ enabled, children, itemsPerPage = 4 }: ExamPaperCompositorProps) {
  if (!enabled) return <>{children}</>;
  const pages: ReactNode[][] = [];
  for (let index = 0; index < children.length; index += itemsPerPage) pages.push(children.slice(index, index + itemsPerPage));
  return <div className="exam-paper-compositor">{pages.map((page, index) => <section className="exam-paper-page" key={`exam-page-${index}`} aria-label={`시험지 ${index + 1}페이지`}><div className="exam-paper-page__columns">{page}</div></section>)}</div>;
}
