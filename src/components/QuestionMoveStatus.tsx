import { useEffect, useRef } from "react";

export default function QuestionMoveStatus({ entryId, label, index, total, active = true }: {
  entryId: string; label: string; index: number; total: number; active?: boolean;
}) {
  const region = useRef<HTMLDivElement>(null);
  const previous = useRef({ entryId, index, label });
  useEffect(() => {
    const before = previous.current;
    previous.current = { entryId, index, label };
    const node = region.current;
    if (!node) return;
    node.textContent = "";
    if (!active || before.entryId !== entryId || before.index === index || !total) return;
    if (node.closest('[inert], [aria-hidden="true"], [hidden]')) return;
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
      .filter(dialog => !dialog.closest('[hidden], [inert], [aria-hidden="true"]'));
    if (dialogs.some(dialog => !dialog.contains(node))) return;
    node.textContent = "문제 " + label + "번으로 이동했습니다. 전체 " + total + "문항 중 " + (index + 1) + "번째입니다.";
  }, [entryId, index, label, total, active]);
  return <div ref={region} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />;
}
