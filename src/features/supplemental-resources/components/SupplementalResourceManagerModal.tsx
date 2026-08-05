import { useState } from "react";
import type { SupplementalResource, WrongAnswerEntry } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";

interface Props {
  entry: WrongAnswerEntry;
  onClose: () => void;
  onRename: (resourceId: string, title: string) => Promise<void>;
  onDelete: (resourceId: string) => Promise<void>;
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

export default function SupplementalResourceManagerModal({ entry, onClose, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resources = entry.supplementalResources ?? [];

  const rename = async (resource: SupplementalResource) => {
    if (!title.trim()) return;
    setBusyId(resource.id);
    setError(null);
    try {
      await onRename(resource.id, title.trim());
      setEditingId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "자료 제목을 저장하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (resource: SupplementalResource) => {
    if (busyId) return;
    setBusyId(resource.id);
    setError(null);
    try {
      await onDelete(resource.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "추가 자료 이력을 삭제하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open onClose={onClose} className="form-modal form-modal--wide supplemental-resource-manager" ariaLabel="추가 자료 관리">
      <div className="form-header">
        <div><h2>추가 자료 관리</h2><p>{entry.title}</p></div>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="추가 자료 관리 닫기">닫기</button>
      </div>
      <div className="form-body">
        {error && <p className="form-error" role="alert">{error}</p>}
        {!resources.length && <p className="list-empty">추가 자료 이력이 없습니다.</p>}
        {resources.map((resource) => (
          <article key={resource.id} className="supplemental-resource-row">
            {editingId === resource.id ? (
              <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="자료 제목" />
            ) : <strong>{resource.title}</strong>}
            <small>{resource.kind} · {dateLabel(resource.createdAt)} · 적용 문항 {(resource.questionNumbers ?? []).length}개</small>
            {resource.sourceFilename && <small>출처: {resource.sourceFilename}</small>}
            {resource.appliedFields?.length ? <small>필드: {resource.appliedFields.join(", ")}</small> : <small>연결 기록</small>}
            <div className="supplemental-resource-actions">
              {editingId === resource.id ? (
                <button type="button" onClick={() => void rename(resource)} disabled={Boolean(busyId)}>저장</button>
              ) : (
                <button type="button" onClick={() => { setEditingId(resource.id); setTitle(resource.title); }}>제목 수정</button>
              )}
              <button type="button" className="danger" onClick={() => void remove(resource)} disabled={Boolean(busyId)}>이력 삭제</button>
            </div>
          </article>
        ))}
      </div>
      <div className="form-footer"><button type="button" className="btn-secondary" onClick={onClose}>닫기</button></div>
    </Dialog>
  );
}
