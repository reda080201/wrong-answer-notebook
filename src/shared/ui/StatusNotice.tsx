import type { ReactNode } from "react";

export type NoticeSeverity = "blocking" | "review" | "info" | "success";
export interface StatusNoticeProps { severity: NoticeSeverity; children: ReactNode; title?: ReactNode; action?: ReactNode; className?: string; }

export function StatusNotice({ severity, children, title, action, className = "" }: StatusNoticeProps) {
  return <div className={`ui-status-notice ui-status-notice--${severity} ${className}`.trim()} role={severity === "blocking" ? "alert" : "status"}><div className="ui-status-notice__body">{title && <strong>{title}</strong>}<div className="ui-status-notice__content">{children}</div></div>{action}</div>;
}
