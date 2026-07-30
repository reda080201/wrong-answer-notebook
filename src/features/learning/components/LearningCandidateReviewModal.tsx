import { useMemo, useState } from "react";
import type { WrongAnswerEntry } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";
import { buildLearningCandidates, filterNewLearningCandidates, type LearningCandidate } from "../services/buildLearningCandidates";

interface LearningCandidateReviewModalProps {
  entry: WrongAnswerEntry;
  onClose: () => void;
  onSave: (blocks: LearningCandidate["block"][]) => Promise<void>;
}

export default function LearningCandidateReviewModal({ entry, onClose, onSave }: LearningCandidateReviewModalProps) {
  const candidates = useMemo(() => filterNewLearningCandidates(entry, buildLearningCandidates(entry)), [entry]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(candidates.map((item) => item.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <Dialog open onClose={onClose} closeDisabled={saving} busy={saving} className="form-modal form-modal--wide" ariaLabel="학습 후보 검토">
    <div className="form-header"><div><h2>학습 후보 검토</h2><p>{entry.title} · 자동 저장하지 않고 선택한 후보만 추가합니다.</p></div><button type="button" className="btn-icon" onClick={onClose} disabled={saving} aria-label="학습 후보 검토 닫기">닫기</button></div>
    <div className="form-body">
      {!candidates.length && <p className="list-empty">새로 추가할 학습 후보가 없습니다.</p>}
      <div className="learning-candidate-list">{candidates.map((candidate) => <label key={candidate.id} className="learning-candidate-row"><input type="checkbox" checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} disabled={saving} /><span><strong>{candidate.block.title}</strong><small>{candidate.block.content}</small><em>{candidate.reason}</em></span></label>)}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="form-footer"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>취소</button><button type="button" className="btn-primary" disabled={saving || !selected.size || !candidates.length} onClick={() => { setSaving(true); setError(null); void onSave(candidates.filter((candidate) => selected.has(candidate.id)).map((candidate) => candidate.block)).then(onClose).catch((reason) => setError(reason instanceof Error ? reason.message : "학습 후보를 저장하지 못했습니다.")).finally(() => setSaving(false)); }}>선택 후보 저장</button></div>
  </Dialog>;
}
