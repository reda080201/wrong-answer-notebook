import type { ReactNode } from "react";

interface EmptyStateProps {
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ children, title, action, className = "" }: EmptyStateProps) {
  return (
    <section className={`empty-state ${className}`.trim()} aria-label={typeof title === "string" ? title : undefined}>
      {title && <h3>{title}</h3>}
      <p>{children}</p>
      {action}
    </section>
  );
}
