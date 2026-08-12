import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label: string;
  size?: "default" | "compact";
}

export function IconButton({
  children,
  className = "",
  label,
  size = "default",
  ...props
}: PropsWithChildren<IconButtonProps>) {
  const classes = ["ui-icon-button", `ui-icon-button--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return <button {...props} type={props.type ?? "button"} className={classes} aria-label={props["aria-label"] ?? label}>{children}</button>;
}
