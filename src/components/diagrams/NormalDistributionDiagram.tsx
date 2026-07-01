import type { NormalDistributionSpec } from "../../types";

export default function NormalDistributionDiagram({ spec }: { spec?: NormalDistributionSpec }) {
  const meanLabel = spec?.meanLabel ?? "mu";
  const sigmaLabels = spec?.sigmaLabels ?? ["-sigma", "+sigma"];
  const shadedRegionLabel = spec?.shadedRegionLabel;
  return (
    <svg className="learning-diagram-svg" viewBox="0 0 320 180" role="img" aria-label="정규분포 다이어그램">
      <rect width="320" height="180" rx="18" fill="#f8fbff" />
      <line x1="34" y1="140" x2="286" y2="140" stroke="#94a3b8" strokeWidth="2" />
      <path d="M44 140 C86 140, 98 125, 124 82 C144 49, 176 49, 196 82 C222 125, 234 140, 276 140" fill="none" stroke="#2563eb" strokeWidth="4" />
      <path d="M160 55 C178 61, 190 86, 205 113 L205 140 L160 140 Z" fill="#bfdbfe" opacity="0.85" />
      <line x1="160" y1="52" x2="160" y2="148" stroke="#1d4ed8" strokeWidth="2" strokeDasharray="4 4" />
      <line x1="116" y1="104" x2="116" y2="144" stroke="#64748b" strokeWidth="1.5" />
      <line x1="204" y1="104" x2="204" y2="144" stroke="#64748b" strokeWidth="1.5" />
      <text x="151" y="164" fill="#1d4ed8" fontSize="13">{meanLabel}</text>
      <text x="96" y="160" fill="#475569" fontSize="12">{sigmaLabels[0] ?? "-sigma"}</text>
      <text x="210" y="160" fill="#475569" fontSize="12">{sigmaLabels[1] ?? "+sigma"}</text>
      {shadedRegionLabel && <text x="188" y="96" fill="#1e3a8a" fontSize="12">{shadedRegionLabel}</text>}
    </svg>
  );
}
