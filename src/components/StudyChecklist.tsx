import { useRef, useState } from "react";
import type { ChecklistItem } from "../types";
import MathText from "./MathText";

export default function StudyChecklist({ items, onChange }: { items: ChecklistItem[]; onChange?: (items: ChecklistItem[]) => Promise<void> }) {
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toggle = async (id: string) => {
    if (!onChange || lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try { await onChange(items.map(item => item.id === id ? { ...item, checked: !item.checked } : item)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "확인 목록을 저장하지 못했습니다."); }
    finally { lock.current = false; setSaving(false); }
  };
  return <div><ul className="learning-checklist">{items.map(item => <li key={item.id}>
    {onChange ? <label><input type="checkbox" checked={item.checked} disabled={saving} onChange={() => void toggle(item.id)} /><MathText text={item.text} /></label>
      : <><span>{item.checked ? "완료" : "미완료"} · </span><MathText text={item.text} /></>}
  </li>)}</ul>{error && <p role="alert">{error} 다시 선택해 재시도하세요.</p>}</div>;
}
