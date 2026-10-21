import { useEffect, useRef, useState } from "react";
import { loadImportWorkspaceDraft } from "../hooks/useImportWorkspaceAutosave";
import type { ImportWorkspace } from "../model/importWorkspace";

export default function ImportDraftRecovery({ onResume }: { onResume(draft: ImportWorkspace): Promise<void> }) {
  const [state, setState] = useState<"loading" | "available" | "empty" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; void loadImportWorkspaceDraft().then(draft => { if (alive.current) setState(draft ? "available" : "empty"); }).catch(e => { if (alive.current) { setState("error"); setError(e instanceof Error ? e.message : "이전 가져오기 초안을 읽지 못했습니다."); } }); return () => { alive.current = false; }; }, []);
  const resume = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const draft = await loadImportWorkspaceDraft();
      if (!alive.current) return;
      if (!draft) { setState("empty"); return; }
      await onResume(draft);
    } catch (e) { if (alive.current) { setState("error"); setError(e instanceof Error ? e.message : "초안 복구에 실패했습니다."); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  if (state === "empty") return null;
  return <section className="import-commit-recovery" role="status">
    <p>{state === "loading" ? "이전 가져오기 초안 확인 중…" : "보존된 가져오기가 있습니다. 새 파일 없이 이어서 검토할 수 있습니다."}</p>
    {error && <p role="alert">{error}</p>}
    {state !== "loading" && <button type="button" disabled={busy} onClick={() => void resume()}>{busy ? "초안 확인 중…" : state === "error" ? "이전 가져오기 다시 불러오기" : "이전 가져오기 이어서"}</button>}
  </section>;
}
