import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export function IconButton({ children, className = "", "aria-label": ariaLabel, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button className={`ui-icon-button ${className}`.trim()} aria-label={ariaLabel} {...props}>{children}</button>;
}
