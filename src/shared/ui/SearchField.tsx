import { X } from "lucide-react";
import type { SearchSuggestion } from "../../utils/searchEngine";

interface SearchFieldProps {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  suggestions?: SearchSuggestion[];
}

export default function SearchField({ value, onChange, placeholder, ariaLabel, className = "", suggestions = [] }: SearchFieldProps) {
  const listId = `${ariaLabel.replace(/\s+/g, "-")}-suggestions`;
  return <div className={`search-field ${className}`.trim()}>
    <input className="search-field__input" type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={ariaLabel} list={suggestions.length ? listId : undefined} />
    {suggestions.length > 0 && <datalist id={listId}>{suggestions.map((suggestion) => <option key={`${suggestion.kind}:${suggestion.value}`} value={`${suggestion.kind}:${suggestion.value}`} />)}</datalist>}
    {value && <button type="button" className="search-field__clear" aria-label="검색어 지우기" title="검색어 지우기" onClick={() => onChange("")}><X size={16} aria-hidden="true" /></button>}
  </div>;
}
