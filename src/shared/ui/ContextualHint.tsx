import { useState, type ReactNode } from "react";

interface ContextualHintProps {
  id: string;
  children: ReactNode;
}

export default function ContextualHint({ id, children }: ContextualHintProps) {
  const key = `wrong-answer-hint:${id}`;
  const [visible, setVisible] = useState(() => {
    try { return sessionStorage.getItem(key) !== "dismissed"; } catch { return true; }
  });
  if (!visible) return null;
  return <aside className="contextual-hint" role="note">
    <span>{children}</span>
    <button type="button" aria-label="힌트 닫기" onClick={() => { try { sessionStorage.setItem(key, "dismissed"); } catch { /* optional session storage */ } setVisible(false); }}>×</button>
  </aside>;
}
