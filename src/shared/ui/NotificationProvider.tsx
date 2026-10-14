import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Snackbar from "./Snackbar";

export interface NotificationInput {
  message: string;
  tone?: "success" | "error" | "info";
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}

interface NotificationContextValue { notify(input: NotificationInput): string; dismiss(id: string): void; }
const NotificationContext = createContext<NotificationContextValue | null>(null);
const NotificationHostContext = createContext<HTMLDivElement | null>(null);

/** Persistent notices and transient notifications share one visual stack. */
export function NotificationRegion({ children }: { children: ReactNode }) {
  const host = useContext(NotificationHostContext);
  return host ? createPortal(<div className="notification-region">{children}</div>, host) : null;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Array<NotificationInput & { id: string }>>([]);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  const dismiss = useCallback((id: string) => {
    setItems(current => current.filter(item => item.id !== id));
    setErrors(current => { const next = { ...current }; delete next[id]; return next; });
  }, []);
  const notify = useCallback((input: NotificationInput) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setItems(current => {
      const next = [...current, { ...input, id }];
      const passive = next.filter(item => !item.onAction).slice(-4);
      return next.filter(item => item.onAction || passive.includes(item));
    });
    return id;
  }, []);
  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);
  const runAction = async (item: NotificationInput & { id: string }) => {
    if (!item.onAction || inFlight.current.has(item.id)) return;
    inFlight.current.add(item.id);
    setBusy(current => new Set(current).add(item.id));
    try {
      await item.onAction();
      dismiss(item.id);
    } catch (cause) {
      setErrors(current => ({ ...current, [item.id]: cause instanceof Error ? cause.message : "작업을 완료하지 못했습니다. 다시 시도해 주세요." }));
    } finally {
      inFlight.current.delete(item.id);
      setBusy(current => { const next = new Set(current); next.delete(item.id); return next; });
    }
  };
  return <NotificationContext.Provider value={value}><NotificationHostContext.Provider value={host}>
    {children}
    <div ref={setHost} className="notification-stack" role="region" aria-label="알림">{items.map(item => <div className="notification-item" key={item.id}><Snackbar disabled={busy.has(item.id)} actionLabel={item.actionLabel} onAction={item.onAction ? () => void runAction(item) : undefined}><span>{item.message}{errors[item.id] && <span className="notification-action-error" role="alert">{errors[item.id]}</span>}</span></Snackbar><button type="button" className="notification-dismiss" disabled={busy.has(item.id)} aria-label={`${item.message} 알림 닫기`} onClick={() => dismiss(item.id)}>×</button></div>)}</div>
  </NotificationHostContext.Provider></NotificationContext.Provider>;
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotification must be used inside NotificationProvider");
  return context;
}
