import { useRef, useState } from "react";
import type { WrongAnswerEntry } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";

interface Props {
  target: WrongAnswerEntry;
  candidates: WrongAnswerEntry[];
  onClose: () => void;
  onLink: (source: WrongAnswerEntry) => Promise<void>;
}

export default function SupplementalLinkModal({ target, candidates, onClose, onLink }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const link = async (candidate: WrongAnswerEntry) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(candidate.id);
    setError(null);
    try {
      await onLink(candidate);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "자료를 연결하지 못했습니다.");
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };
  return (
    <Dialog open onClose={onClose} className="form-modal supplemental-link-modal" ariaLabel="특강·개념자료 연결">
      <div className="form-header">
        <div><h2>특강·개념자료 연결</h2><p>대상 문제지: {target.title}</p></div>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="자료 연결 닫기">닫기</button>
      </div>
      <div className="form-body">
        {error && <p className="form-error" role="alert">{error}</p>}
        {!candidates.length && <p className="list-empty">연결할 특강·개념자료가 없습니다.</p>}
        {candidates.map((candidate) => {
          const linked = target.linkedEntryIds?.includes(candidate.id) ?? false;
          return (
            <div key={candidate.id} className="supplemental-resource-row">
              <strong>{candidate.title || "제목 없음"}</strong>
              <small>{candidate.entryKind === "lecture" ? "특강" : "개념"} · {candidate.subject}</small>
              <button type="button" onClick={() => void link(candidate)} disabled={linked || Boolean(busyId)}>{busyId === candidate.id ? "연결 중…" : linked ? "이미 연결됨" : "연결"}</button>
            </div>
          );
        })}
      </div>
      <div className="form-footer"><button type="button" className="btn-secondary" onClick={onClose}>닫기</button></div>
    </Dialog>
  );
}
