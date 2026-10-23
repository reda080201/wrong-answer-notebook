import { useEffect, useRef, useState } from "react";
import { loadImportWorkspaceDraft } from "../hooks/useImportWorkspaceAutosave";
import type { ImportWorkspace } from "../model/importWorkspace";
import Dialog from "../../../shared/ui/Dialog";

export default function ImportDraftRecovery({ onResume, onVerify, onCancel }: { onResume(draft: ImportWorkspace): Promise<void>; onVerify?(): Promise<void>; onCancel?(): Promise<void> }) {
  const [state, setState] = useState<"loading" | "available" | "empty" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ImportWorkspace["commitAttempt"]>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; void loadImportWorkspaceDraft().then(draft => { if (alive.current) { setState(draft ? "available" : "empty"); setReceipt(draft?.commitAttempt); } }).catch(e => { if (alive.current) { setState("error"); setError(e instanceof Error ? e.message : "이전 가져오기 초안을 읽지 못했습니다."); } }); return () => { alive.current = false; }; }, []);
  const resume = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const draft = await loadImportWorkspaceDraft();
      if (!alive.current) return;
      if (!draft) { setState("empty"); return; }
      setReceipt(draft.commitAttempt);
      await onResume(draft);
    } catch (e) { if (alive.current) { setState("error"); setError(e instanceof Error ? e.message : "초안 복구에 실패했습니다."); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const run = async (action: () => Promise<void>, cancel = false) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await action();
      if (alive.current) { setState("empty"); setConfirmCancel(false); }
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : "저장 결과를 확인하지 못했습니다."); if (cancel) setConfirmCancel(false); }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  if (state === "empty") return null;
  return <><section className="import-commit-recovery" aria-label="이전 가져오기 복구" aria-busy={busy}>
    <h3>{state === "loading" ? "이전 가져오기 확인 중…" : receipt ? "이전 가져오기의 저장 결과를 확인해 주세요" : "이어서 검토할 가져오기가 있습니다"}</h3>
    <p>{receipt ? "저장이 시작된 기록이 남아 있어 중복 가져오기를 막고 있습니다. 저장 결과가 일치하면 기록을 정리합니다. 내용이 다르면 덮어쓰지 않습니다." : "보존된 가져오기가 있습니다. 새 파일 없이 이어서 검토할 수 있습니다."}</p>
    {error && <p role="alert">{error}</p>}
    <div className="import-recovery-actions">
      {receipt && onVerify && <button className="btn-primary" type="button" disabled={busy} onClick={() => void run(onVerify)}>{busy ? "확인 중…" : "저장 결과 확인·정리"}</button>}
      {state !== "loading" && <button className="btn-secondary" type="button" disabled={busy} onClick={() => void resume()}>{busy ? "초안 확인 중…" : state === "error" ? "이전 가져오기 다시 불러오기" : "이전 가져오기 이어서"}</button>}
      {receipt?.state === "pending" && onCancel && <button className="btn-secondary" type="button" disabled={busy} onClick={() => setConfirmCancel(true)}>저장 전 가져오기 취소</button>}
    </div>
    {receipt && <p className="form-hint">새 파일로 시작하려면 먼저 확인하거나 저장 전 가져오기를 취소하세요. 닫아도 이 기록은 유지됩니다.</p>}
  </section><Dialog open={confirmCancel} title="저장 전 가져오기를 취소할까요?" onClose={() => setConfirmCancel(false)} busy={busy} closeDisabled={busy} footer={<div className="dialog-actions"><button className="btn-secondary" type="button" disabled={busy} onClick={() => setConfirmCancel(false)}>돌아가기</button><button className="btn-danger" type="button" disabled={busy} onClick={() => onCancel && void run(onCancel, true)}>가져오기 취소</button></div>}><p>해당 작업의 항목이 하나도 저장되지 않은 경우에만 초안과 확정 기록을 정리합니다. 이미 저장된 항목이 있거나 저장소를 읽지 못하면 취소하지 않습니다. 이미지 파일은 삭제하지 않습니다.</p></Dialog></>;
}
