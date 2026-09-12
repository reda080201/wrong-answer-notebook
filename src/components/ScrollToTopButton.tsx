import { useEffect, useState, type RefObject } from "react";

interface ScrollToTopButtonProps {
  containerRef: RefObject<HTMLElement | null>;
  threshold?: number;
}

export default function ScrollToTopButton({ containerRef, threshold = 320 }: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const update = () => setVisible(container.scrollTop > threshold);
    container.addEventListener("scroll", update, { passive: true });
    update();
    return () => container.removeEventListener("scroll", update);
  }, [containerRef, threshold]);

  if (!visible) return null;
  return <button type="button" className="scroll-to-top-button" aria-label="맨 위로" onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>↑</button>;
}
