import type { ReactNode } from "react";
import { X } from "lucide-react";
import Dialog from "./Dialog";

export interface FullscreenDialogProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  sidebar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export default function FullscreenDialog({
  open,
  title,
  onClose,
  sidebar,
  footer,
  children,
}: FullscreenDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="fullscreen"
      className="fullscreen-dialog-card"
      backdropClassName="fullscreen-dialog-backdrop"
      bodyClassName="fullscreen-dialog-body"
      scrollMode="custom"
      header={
        <button type="button" className="fullscreen-dialog-close ui-icon-button" aria-label="전체 화면 닫기" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      }
      footer={footer}
    >
      <div className="fullscreen-dialog-layout">
        {sidebar && <aside className="fullscreen-dialog-sidebar">{sidebar}</aside>}
        <main className="fullscreen-dialog-content">{children}</main>
      </div>
    </Dialog>
  );
}
