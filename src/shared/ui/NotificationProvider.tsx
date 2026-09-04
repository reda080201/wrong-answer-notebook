import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import Snackbar from "./Snackbar";

export interface NotificationInput {
  message: string;
  tone?: "success" | "error" | "info";
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}

interface NotificationContextValue { notify(input: NotificationInput): string; dismiss(id: string): void; }
const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Array<NotificationInput & { id: string }>>([]);
  const dismiss = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const notify = useCallback((input: NotificationInput) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setItems((current) => [...current.slice(-3), { ...input, id }]);
    return id;
  }, []);
  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);
  return <NotificationContext.Provider value={value}>
    {children}
    <div className="notification-stack" aria-live="polite">{items.map((item) => <div key={item.id} onAnimationEnd={() => undefined}><Snackbar actionLabel={item.actionLabel} onAction={item.onAction ? () => { void item.onAction?.(); dismiss(item.id); } : undefined}>{item.message}</Snackbar><button type="button" className="notification-dismiss" aria-label="알림 닫기" onClick={() => dismiss(item.id)}>×</button></div>)}</div>
  </NotificationContext.Provider>;
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotification must be used inside NotificationProvider");
  return context;
}
