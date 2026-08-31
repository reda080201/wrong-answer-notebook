import type { ReactNode } from "react";

interface ToastProps {
  tone: "success" | "error" | "info" | "warning";
  children: ReactNode;
}

export default function Toast({ tone, children }: ToastProps) {
  return <div className={`study-toast study-toast--${tone}`} role="status">{children}</div>;
}
