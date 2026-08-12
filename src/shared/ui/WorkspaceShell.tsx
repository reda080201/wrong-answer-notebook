import type { ReactNode } from "react";

export interface WorkspaceShellProps { children: ReactNode; sidebar?: ReactNode; toolbar?: ReactNode; footer?: ReactNode; className?: string; }

export function WorkspaceShell({ children, sidebar, toolbar, footer, className = "" }: WorkspaceShellProps) {
  return <section className={`ui-workspace ${sidebar ? "ui-workspace--has-sidebar" : ""} ${className}`.trim()}>{sidebar && <aside className="ui-workspace__sidebar">{sidebar}</aside>}<div className="ui-workspace__main">{toolbar && <header className="ui-workspace__toolbar">{toolbar}</header>}<main className="ui-workspace__content">{children}</main>{footer && <footer className="ui-workspace__footer">{footer}</footer>}</div></section>;
}
