import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function Button({ children, className, type = "button", ...props }: ButtonProps) {
  return <button {...props} type={type} className={className}>{children}</button>;
}

interface IconButtonProps extends ButtonProps {
  label: string;
}

export function IconButton({ label, children, className, ...props }: IconButtonProps) {
  return <Button {...props} className={className} aria-label={props["aria-label"] ?? label}>{children}</Button>;
}
