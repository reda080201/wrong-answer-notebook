import { useState } from "react";
import Dialog from "./Dialog";

export default function QuestionNavigator({ count, current, numbers, onChange, collapsed = false, onCollapsedChange }: { count: number; current: number; numbers?: string[]; onChange: (index: number) => void; collapsed?: boolean; onCollapsedChange?: (value: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <div className={`question-navigator ${collapsed ? "question-navigator--collapsed" : ""}`} aria-label="문항 탐색">
      <button type="button" className="btn-icon" aria-label={collapsed ? "문항 목차 펼치기" : "문항 목차 접기"} onClick={() => onCollapsedChange?.(!collapsed)}>{collapsed ? "목차" : "접기"}</button>
      {!collapsed && <div className="question-navigator-list">{Array.from({ length: count }, (_, index) => { const label = numbers?.[index] ?? String(index + 1); return <button key={index} type="button" aria-label={`${label}번 문항`} aria-current={index === current ? "true" : undefined} className={index === current ? "active" : ""} onClick={() => onChange(index)}>{label}</button>; })}</div>}
      <button type="button" className="btn-icon" aria-label="문항 번호로 이동" onClick={() => setOpen(true)}>이동</button>
    </div>
    <Dialog open={open} onClose={() => setOpen(false)} title="문항으로 이동" size="sm">
      <div className="question-jump-grid">{Array.from({ length: count }, (_, index) => { const label = numbers?.[index] ?? String(index + 1); return <button key={index} type="button" aria-label={`${label}번 문항으로 이동`} className={index === current ? "active" : ""} onClick={() => { onChange(index); setOpen(false); }}>{label}</button>; })}</div>
    </Dialog>
  </>;
}
