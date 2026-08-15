import { useEffect, useId, useRef, type ReactNode } from "react";
import "../../styles/dialog-shell.css";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export type DialogSize = "sm" | "md" | "lg" | "xl" | "fullscreen";
export type DialogScrollMode = "body" | "custom";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
  title?: ReactNode;
  titleId?: string;
  backdropClassName?: string;
  className?: string;
  closeOnBackdrop?: boolean;
  closeDisabled?: boolean;
  busy?: boolean;
  size?: DialogSize;
  header?: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
  scrollMode?: DialogScrollMode;
}

export default function Dialog({
  open,
  onClose,
  children,
  ariaLabel,
  title,
  titleId,
  backdropClassName = "modal-backdrop",
  className = "modal-card",
  closeOnBackdrop = true,
  closeDisabled = false,
  busy = false,
  size,
  header,
  footer,
  bodyClassName,
  scrollMode = "body",
}: DialogProps) {
  const generatedTitleId = useId();
  const resolvedTitleId = title ? (titleId ?? generatedTitleId) : undefined;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeDisabledRef = useRef(closeDisabled);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    const frame = window.requestAnimationFrame(() => {
      const autoFocusTarget = dialog?.querySelector<HTMLElement>("[data-dialog-initial-focus]");
      (autoFocusTarget ?? focusable()[0] ?? dialog)?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      const openDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
      if (openDialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        if (closeDisabledRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  const resolvedClassName = [className, size && `dialog-size-${size}`, `dialog-scroll-${scrollMode}`].filter(Boolean).join(" ");
  const titleNode = title ? <h2 id={resolvedTitleId}>{title}</h2> : null;

  return (
    <div
      className={backdropClassName}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop && !closeDisabled) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={resolvedClassName}
        role="dialog"
        aria-modal="true"
        aria-label={resolvedTitleId ? undefined : ariaLabel}
        aria-labelledby={resolvedTitleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        {(header || titleNode) && <header className="dialog-header">{titleNode}{header}</header>}
        <div className={["dialog-body", bodyClassName].filter(Boolean).join(" ")}>{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </div>
  );
}
