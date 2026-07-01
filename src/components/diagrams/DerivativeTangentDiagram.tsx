import type { DerivativeTangentSpec } from "../../types";

export default function DerivativeTangentDiagram({ spec }: { spec?: DerivativeTangentSpec }) {
  const pointLabel = spec?.pointLabel ?? "x=a";
  const tangentLabel = spec?.tangentLabel ?? "접선 기울기";
  const functionLabel = spec?.functionLabel ?? "y=f(x)";
  const slopeLabel = spec?.slopeLabel;
  const xLabel = spec?.xLabel;
  const yLabel = spec?.yLabel;
  return (
    <svg
      className="learning-diagram-svg"
      viewBox="0 0 320 180"
      role="img"
      aria-label="미분계수와 접선 다이어그램"
    >
      <rect width="320" height="180" rx="18" fill="#f8fbff" />
      <line x1="36" y1="142" x2="284" y2="142" stroke="#94a3b8" strokeWidth="2" />
      <line x1="54" y1="156" x2="54" y2="24" stroke="#94a3b8" strokeWidth="2" />
      <path
        d="M56 136 C98 128, 122 106, 148 78 C174 49, 212 36, 270 32"
        fill="none"
        stroke="#2563eb"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line x1="84" y1="122" x2="238" y2="45" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
      <circle cx="146" cy="80" r="6" fill="#1d4ed8" />
      <path d="M142 80 L142 142" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="132" y="163" fill="#334155" fontSize="14">{pointLabel}</text>
      <text x="176" y="64" fill="#9a3412" fontSize="14">{tangentLabel}</text>
      <text x="68" y="34" fill="#1e3a8a" fontSize="14">{functionLabel}</text>
      {slopeLabel && <text x="198" y="82" fill="#9a3412" fontSize="12">{slopeLabel}</text>}
      {xLabel && <text x="266" y="160" fill="#475569" fontSize="12">{xLabel}</text>}
      {yLabel && <text x="30" y="34" fill="#475569" fontSize="12">{yLabel}</text>}
    </svg>
  );
}
