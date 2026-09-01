interface SearchFieldProps {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}

export default function SearchField({ value, onChange, placeholder, ariaLabel, className }: SearchFieldProps) {
  return <span className={`ui-search-field ${className ?? ""}`.trim()}>
    <input type="search" value={value} placeholder={placeholder} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)} />
    {value && <button type="button" aria-label="검색어 지우기" onClick={() => onChange("")}>×</button>}
  </span>;
}
