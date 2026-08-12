import type { ReactNode } from "react";

export interface SegmentedControlItem<T extends string> { id: T; label: ReactNode; disabled?: boolean; }
export interface SegmentedControlProps<T extends string> { items: readonly SegmentedControlItem<T>[]; value: T; onChange(value: T): void; ariaLabel: string; className?: string; }

export function SegmentedControl<T extends string>({ items, value, onChange, ariaLabel, className = "" }: SegmentedControlProps<T>) {
  return <div className={`ui-segmented ${className}`.trim()} role="group" aria-label={ariaLabel}>{items.map((item) => <button key={item.id} type="button" className="ui-segmented__item" aria-pressed={value === item.id} disabled={item.disabled} onClick={() => onChange(item.id)}>{item.label}</button>)}</div>;
}
