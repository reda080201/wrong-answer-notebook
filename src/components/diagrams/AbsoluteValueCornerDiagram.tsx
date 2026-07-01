import type { AbsoluteValueCornerSpec } from "../../types";

export default function AbsoluteValueCornerDiagram({ spec }: { spec?: AbsoluteValueCornerSpec }) {
  const cornerLabel = spec?.cornerLabel ?? "뾰족점";
  const leftSlopeLabel = spec?.leftSlopeLabel ?? "좌·우 기울기 다름";
  const rightSlopeLabel = spec?.rightSlopeLabel;
  const xLabel = spec?.xLabel;
  const yLabel = spec?.yLabel;
  return (
    <svg
      className="learning-diagram-svg"
      viewBox="0 0 320 180"
      role="img"
      aria-label="절댓값 함수의 뾰족점 다이어그램"
    >
      <rect width="320" height="180" rx="18" fill="#fffdf7" />
      <line x1="36" y1="140" x2="284" y2="140" stroke="#94a3b8" strokeWidth="2" />
      <line x1="160" y1="158" x2="160" y2="24" stroke="#94a3b8" strokeWidth="2" />
      <path d="M72 122 L160 46 L248 122" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="160" cy="46" r="6" fill="#dc2626" />
      <path d="M130 72 L160 46 L190 72" fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="5 5" />
      <text x="112" y="34" fill="#991b1b" fontSize="14">{leftSlopeLabel}</text>
      {rightSlopeLabel && <text x="178" y="85" fill="#9a3412" fontSize="12">{rightSlopeLabel}</text>}
      <text x="171" y="61" fill="#334155" fontSize="13">{cornerLabel}</text>
      <text x="225" y="137" fill="#1e3a8a" fontSize="14">|x-a|</text>
      {xLabel && <text x="267" y="158" fill="#475569" fontSize="12">{xLabel}</text>}
      {yLabel && <text x="170" y="26" fill="#475569" fontSize="12">{yLabel}</text>}
    </svg>
  );
}
