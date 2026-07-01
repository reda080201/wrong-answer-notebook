import type { VennDiagramSpec } from "../../types";

export default function VennDiagram({ spec }: { spec?: VennDiagramSpec }) {
  const setLabels = spec?.setLabels ?? ["A", "B"];
  const intersectionLabel = spec?.intersectionLabel ?? "A ∩ B";
  return (
    <svg className="learning-diagram-svg" viewBox="0 0 320 180" role="img" aria-label="벤 다이어그램">
      <rect width="320" height="180" rx="18" fill="#f8fbff" />
      <rect x="46" y="28" width="228" height="126" rx="14" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
      <circle cx="132" cy="92" r="54" fill="#bfdbfe" fillOpacity="0.65" stroke="#2563eb" strokeWidth="3" />
      <circle cx="188" cy="92" r="54" fill="#fed7aa" fillOpacity="0.65" stroke="#f97316" strokeWidth="3" />
      <text x="104" y="62" fill="#1e3a8a" fontSize="16">{setLabels[0] ?? "A"}</text>
      <text x="208" y="62" fill="#9a3412" fontSize="16">{setLabels[1] ?? "B"}</text>
      <text x="139" y="98" fill="#334155" fontSize="13">{intersectionLabel}</text>
      {spec?.outsideLabel && <text x="58" y="144" fill="#475569" fontSize="12">{spec.outsideLabel}</text>}
    </svg>
  );
}
