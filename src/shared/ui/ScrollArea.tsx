import type { HTMLAttributes, ReactNode } from "react";

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  axis?: "vertical" | "horizontal" | "both";
}

export function ScrollArea({ children, className = "", axis = "vertical", ...props }: ScrollAreaProps) {
  const classes = ["ui-scroll-area", `ui-scroll-area--${axis}`, className].filter(Boolean).join(" ");
  return <div {...props} className={classes} role={props.role ?? (props["aria-label"] ? "region" : undefined)}>{children}</div>;
}
