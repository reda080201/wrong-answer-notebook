import type { ReactNode } from "react";

interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Field({ label, htmlFor, hint, error, children, className = "" }: FieldProps) {
  return (
    <div className={`form-field ${className}`.trim()}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="form-hint">{hint}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
