import { useRef, useState } from "react";

export default function ExternalLinkAction({ url, label, onOpen }: {
  url: string; label: string; onOpen: () => void | Promise<void>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const open = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try { await onOpen(); }
    catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "외부 페이지를 열지 못했습니다.");
    } finally { locked.current = false; setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage("주소를 복사했습니다."); }
    catch { setMessage("주소를 복사하지 못했습니다. 아래 주소를 직접 복사해 주세요."); }
  };
  return <div>
    <button type="button" className="btn-secondary" disabled={busy} onClick={() => void open()}>{busy ? "여는 중…" : label}</button>
    {failed && <div><button type="button" className="btn-secondary" onClick={() => void copy()}>주소 복사</button><p className="form-hint">{url}</p></div>}
    {message && <p role="status" className="form-hint">{message}</p>}
  </div>;
}
