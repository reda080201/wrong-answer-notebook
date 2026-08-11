import { useId } from "react";
import type { HTMLAttributes, ReactNode } from "react";

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({ children, title, action, className = "", ...props }: EmptyStateProps) {
  const titleId = useId();
  const classes = ["ui-empty-state", "empty-state", className].filter(Boolean).join(" ");

  return (
    <section {...props} className={classes} aria-labelledby={title ? titleId : undefined}>
      {title && <h3 id={titleId}>{title}</h3>}
      <p>{children}</p>
      {action}
    </section>
  );
}
