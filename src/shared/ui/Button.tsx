import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "default" | "compact";
}

export function Button({
  children,
  className = "",
  type = "button",
  variant = "secondary",
  size = "default",
  ...props
}: ButtonProps) {
  const classes = ["ui-button", `ui-button--${variant}`, `ui-button--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return <button {...props} type={type} className={classes}>{children}</button>;
}
