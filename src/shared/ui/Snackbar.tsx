import { useRef, useState, type ReactNode } from "react";

interface SnackbarProps {
  children: ReactNode;
  actionLabel?: string;
  onAction?(): void | Promise<void>;
  disabled?: boolean;
}

export default function Snackbar({ children, actionLabel, onAction, disabled }: SnackbarProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const act = async () => {
    if (!onAction || disabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try { await onAction(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "작업을 완료하지 못했습니다. 다시 시도해 주세요."); }
    finally { inFlight.current = false; setPending(false); }
  };
  return <div className="app-snackbar" role="status"><span>{children}{error && <span className="notification-action-error" role="alert">{error}</span>}</span>{actionLabel && onAction && <button type="button" className="btn-secondary" onClick={() => void act()} disabled={disabled || pending}>{actionLabel}</button>}</div>;
}
