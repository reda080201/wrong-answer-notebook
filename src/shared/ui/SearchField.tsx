import { X } from "lucide-react";

interface SearchFieldProps {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}

export default function SearchField({ value, onChange, placeholder, ariaLabel, className = "" }: SearchFieldProps) {
  return <div className={`search-field ${className}`.trim()}>
    <input className="search-field__input" type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={ariaLabel} />
    {value && <button type="button" className="search-field__clear" aria-label="검색어 지우기" title="검색어 지우기" onClick={() => onChange("")}><X size={16} aria-hidden="true" /></button>}
  </div>;
}
