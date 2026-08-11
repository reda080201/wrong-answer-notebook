import type { HTMLAttributes, ReactNode } from "react";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  variant?: "default" | "muted" | "raised";
}

export function Surface({ children, className = "", variant = "default", ...props }: SurfaceProps) {
  const classes = ["ui-surface", `ui-surface--${variant}`, className].filter(Boolean).join(" ");
  return <div {...props} className={classes}>{children}</div>;
}

export interface PanelProps extends Omit<SurfaceProps, "title"> {
  title?: ReactNode;
  actions?: ReactNode;
}

export function Panel({ children, className = "", title, actions, ...props }: PanelProps) {
  const classes = ["ui-panel", className].filter(Boolean).join(" ");
  return (
    <section {...props} className={classes}>
      {(title || actions) && (
        <header className="ui-panel__header">
          {title && <h2 className="ui-panel__title">{title}</h2>}
          {actions && <div className="ui-panel__actions">{actions}</div>}
        </header>
      )}
      <div className="ui-panel__body">{children}</div>
    </section>
  );
}
