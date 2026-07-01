import type { CoordinateGraphSpec } from "../../types";

export default function CoordinateGraphDiagram({ spec }: { spec?: CoordinateGraphSpec }) {
  const curveLabel = spec?.curveLabel ?? "y=f(x)";
  const interceptLabel = spec?.interceptLabel;
  const pointLabels = spec?.pointLabels ?? ["A", "B"];
  return (
    <svg className="learning-diagram-svg" viewBox="0 0 320 180" role="img" aria-label="좌표 그래프 다이어그램">
      <rect width="320" height="180" rx="18" fill="#f8fbff" />
      <line x1="42" y1="140" x2="286" y2="140" stroke="#94a3b8" strokeWidth="2" />
      <line x1="62" y1="154" x2="62" y2="26" stroke="#94a3b8" strokeWidth="2" />
      <path d="M68 126 C104 112, 124 56, 158 72 C194 89, 210 122, 268 38" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
      <circle cx="122" cy="63" r="5" fill="#1d4ed8" />
      <circle cx="212" cy="117" r="5" fill="#f97316" />
      <text x="226" y="58" fill="#1e3a8a" fontSize="14">{curveLabel}</text>
      <text x="112" y="52" fill="#1d4ed8" fontSize="12">{pointLabels[0] ?? "A"}</text>
      <text x="220" y="122" fill="#9a3412" fontSize="12">{pointLabels[1] ?? "B"}</text>
      {interceptLabel && <text x="68" y="134" fill="#475569" fontSize="12">{interceptLabel}</text>}
      {spec?.xLabel && <text x="272" y="160" fill="#475569" fontSize="12">{spec.xLabel}</text>}
      {spec?.yLabel && <text x="32" y="34" fill="#475569" fontSize="12">{spec.yLabel}</text>}
    </svg>
  );
}
