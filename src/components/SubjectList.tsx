import { useState } from "react";

interface SubjectListProps {
  subjectOrder: string[];
  subjectFilter: string | null;
  subjectCounts: Record<string, number>;
  totalCount: number;
  onSelect: (subject: string | null) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export default function SubjectList({
  subjectOrder,
  subjectFilter,
  subjectCounts,
  totalCount,
  onSelect,
  onReorder,
}: SubjectListProps) {
  const [manageOrder, setManageOrder] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleDrop = (toIndex: number) => {
    if (dragIndex !== null && dragIndex !== toIndex) {
      onReorder(dragIndex, toIndex);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <nav className="subject-list">
      <div className="subject-list-heading"><span>과목</span><button type="button" className="btn-ghost btn-sm" aria-pressed={manageOrder} onClick={() => setManageOrder((value) => !value)}>{manageOrder ? "관리 완료" : "관리"}</button></div>
      <button
        type="button"
        className={`subject-item ${!subjectFilter ? "active" : ""}`}
        onClick={() => onSelect(null)}
      >
        <span className="subject-drag-placeholder" aria-hidden="true" />
        <span>전체</span>
        <span className="subject-count">{totalCount}</span>
      </button>

      {subjectOrder.map((s, index) => (
        <div
          key={s}
          className={`subject-row ${overIndex === index ? "drag-over" : ""} ${dragIndex === index ? "dragging" : ""}`}
          draggable={manageOrder}
          onDragStart={() => { if (manageOrder) setDragIndex(index); }}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          onDragOver={(e) => {
            if (!manageOrder) return;
            e.preventDefault();
            setOverIndex(index);
          }}
          onDragLeave={() => { if (manageOrder) setOverIndex((v) => (v === index ? null : v)); }}
          onDrop={(e) => {
            if (!manageOrder) return;
            e.preventDefault();
            handleDrop(index);
          }}
        >
          <button
            type="button"
            className={`subject-item ${subjectFilter === s ? "active" : ""}`}
            onClick={() => onSelect(subjectFilter === s ? null : s)}
          >
            <span className="subject-drag-handle" aria-hidden={!manageOrder} title={manageOrder ? "드래그하여 순서 변경" : undefined}>⋮⋮</span>
            <span>{s}</span>
            <span className="subject-count">{subjectCounts[s] ?? 0}</span>
          </button>
        </div>
      ))}

      {manageOrder && <p className="subject-hint">과목을 드래그해 순서를 바꿀 수 있습니다</p>}
    </nav>
  );
}
