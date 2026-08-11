import type { ReactNode } from "react";
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
      header={
        <button type="button" className="fullscreen-dialog-close" onClick={onClose}>
          닫기
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
