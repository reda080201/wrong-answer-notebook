import { useEffect, useRef, useState, type ReactNode } from "react";

/** Reading-list optimization only. A mounted editor stays mounted as it scrolls away. */
export default function ProgressiveQuestionBody({ eager, label, children }: { eager: boolean; label: string; children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(eager || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (mounted) return;
    if (eager) {
      const frame = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setMounted(true); observer.disconnect(); }
    }, { rootMargin: "500px 0px" });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [eager, mounted]);
  return <div ref={host} className="progressive-question-body" data-question-body={mounted || eager ? "mounted" : "deferred"}>
    {mounted || eager ? children : <div className="progressive-question-placeholder"><span>{label}</span><button type="button" className="btn-secondary" onClick={() => setMounted(true)}>문항 내용 불러오기</button></div>}
  </div>;
}
