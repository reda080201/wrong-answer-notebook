import type { HTMLAttributes } from "react";

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
}

export function Divider({ className = "", orientation = "horizontal", ...props }: DividerProps) {
  const classes = ["ui-divider", `ui-divider--${orientation}`, className].filter(Boolean).join(" ");
  return <hr {...props} className={classes} aria-orientation={orientation} />;
}
