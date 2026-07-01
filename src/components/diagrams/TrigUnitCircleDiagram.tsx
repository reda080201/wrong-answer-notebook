import type { TrigUnitCircleSpec } from "../../types";

export default function TrigUnitCircleDiagram({ spec }: { spec?: TrigUnitCircleSpec }) {
  const angleLabel = spec?.angleLabel ?? "theta";
  const sinLabel = spec?.sinLabel ?? "sin theta";
  const cosLabel = spec?.cosLabel ?? "cos theta";
  const pointLabel = spec?.pointLabel ?? "(cos theta, sin theta)";
  return (
    <svg className="learning-diagram-svg" viewBox="0 0 320 180" role="img" aria-label="삼각함수 단위원 다이어그램">
      <rect width="320" height="180" rx="18" fill="#f8fbff" />
      <line x1="48" y1="90" x2="272" y2="90" stroke="#94a3b8" strokeWidth="2" />
      <line x1="160" y1="154" x2="160" y2="26" stroke="#94a3b8" strokeWidth="2" />
      <circle cx="160" cy="90" r="56" fill="#ffffff" stroke="#2563eb" strokeWidth="3" />
      <line x1="160" y1="90" x2="207" y2="60" stroke="#f97316" strokeWidth="3" />
      <line x1="207" y1="60" x2="207" y2="90" stroke="#1d4ed8" strokeWidth="2" strokeDasharray="4 4" />
      <line x1="160" y1="90" x2="207" y2="90" stroke="#16a34a" strokeWidth="2" strokeDasharray="4 4" />
      <circle cx="207" cy="60" r="5" fill="#f97316" />
      <path d="M184 90 A24 24 0 0 0 180 77" fill="none" stroke="#64748b" strokeWidth="2" />
      <text x="184" y="83" fill="#475569" fontSize="12">{angleLabel}</text>
      <text x="211" y="78" fill="#1d4ed8" fontSize="12">{sinLabel}</text>
      <text x="176" y="108" fill="#166534" fontSize="12">{cosLabel}</text>
      <text x="188" y="51" fill="#9a3412" fontSize="11">{pointLabel}</text>
    </svg>
  );
}
