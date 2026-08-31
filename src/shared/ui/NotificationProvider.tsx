import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import Toast from "./Toast";
import type { NotificationInput } from "./notificationRegistry";

interface NotificationContextValue {
  notify(input: NotificationInput): string;
  dismiss(id: string): void;
}
const NotificationContext = createContext<NotificationContextValue>({ notify: () => "", dismiss: () => undefined });

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Array<NotificationInput & { id: string }>>([]);
  const dismiss = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const notify = useCallback((input: NotificationInput) => {
    const id = crypto.randomUUID();
    setItems((current) => [...current, { ...input, id }].slice(-4));
    return id;
  }, []);
  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);
  return <NotificationContext.Provider value={value}>{children}<div className="notification-stack" aria-live="polite">{items.map((item) => <Toast key={item.id} tone={item.tone === "warning" ? "warning" : item.tone ?? "info"}>{item.message}{item.action && <button type="button" onClick={() => { void item.action?.run(); dismiss(item.id); }}>{item.action.label}</button>}</Toast>)}</div></NotificationContext.Provider>;
}

export function useNotification() { return useContext(NotificationContext); }
