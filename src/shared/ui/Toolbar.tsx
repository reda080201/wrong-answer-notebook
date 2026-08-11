import type { HTMLAttributes, ReactNode } from "react";

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  label?: string;
  align?: "start" | "between" | "end";
}

export function Toolbar({ children, className = "", label, align = "between", ...props }: ToolbarProps) {
  const classes = ["ui-toolbar", `ui-toolbar--${align}`, className].filter(Boolean).join(" ");
  return <div {...props} className={classes} role={props.role ?? "toolbar"} aria-label={label ?? props["aria-label"]}>{children}</div>;
}
