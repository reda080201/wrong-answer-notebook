import type { HTMLAttributes, ReactNode } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
  size?: "default" | "compact";
}

export function Badge({ children, className = "", tone = "neutral", size = "default", ...props }: BadgeProps) {
  const classes = ["ui-badge", `ui-badge--${tone}`, `ui-badge--${size}`, className].filter(Boolean).join(" ");
  return <span {...props} className={classes}>{children}</span>;
}
