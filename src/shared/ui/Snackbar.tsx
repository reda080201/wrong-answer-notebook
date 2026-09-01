import type { ReactNode } from "react";

interface SnackbarProps {
  children: ReactNode;
  actionLabel?: string;
  onAction?(): void;
  disabled?: boolean;
}

export default function Snackbar({ children, actionLabel, onAction, disabled }: SnackbarProps) {
  return <div className="app-snackbar" role="status"><span>{children}</span>{actionLabel && onAction && <button type="button" onClick={onAction} disabled={disabled}>{actionLabel}</button>}</div>;
}
