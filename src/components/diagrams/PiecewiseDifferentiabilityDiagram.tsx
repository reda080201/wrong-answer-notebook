import type { PiecewiseDifferentiabilitySpec } from "../../types";

export default function PiecewiseDifferentiabilityDiagram({ spec }: { spec?: PiecewiseDifferentiabilitySpec }) {
  const boundaryLabel = spec?.boundaryLabel ?? "경계 x=a";
  const leftLabel = spec?.leftLabel ?? "좌미분계수";
  const rightLabel = spec?.rightLabel ?? "우미분계수";
  const conditionLabel = spec?.conditionLabel ?? "함숫값·좌우기울기 모두 확인";
  const xLabel = spec?.xLabel;
  const yLabel = spec?.yLabel;
  return (
    <svg
      className="learning-diagram-svg"
      viewBox="0 0 320 180"
      role="img"
      aria-label="구간별 함수의 미분가능성 확인 다이어그램"
    >
      <rect width="320" height="180" rx="18" fill="#f8fff9" />
      <line x1="36" y1="140" x2="284" y2="140" stroke="#94a3b8" strokeWidth="2" />
      <line x1="58" y1="158" x2="58" y2="24" stroke="#94a3b8" strokeWidth="2" />
      <path d="M62 122 C100 112, 124 94, 152 68" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
      <path d="M168 72 C196 95, 222 112, 270 118" fill="none" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" />
      <line x1="160" y1="36" x2="160" y2="146" stroke="#ef4444" strokeWidth="2" strokeDasharray="5 5" />
      <circle cx="152" cy="68" r="5" fill="#2563eb" />
      <circle cx="168" cy="72" r="5" fill="#16a34a" />
      <path d="M126 92 L152 68" stroke="#f97316" strokeWidth="2" />
      <path d="M168 72 L194 94" stroke="#f97316" strokeWidth="2" />
      <text x="130" y="27" fill="#991b1b" fontSize="14">{boundaryLabel}</text>
      <text x="74" y="48" fill="#1e3a8a" fontSize="13">{leftLabel}</text>
      <text x="196" y="54" fill="#166534" fontSize="13">{rightLabel}</text>
      <text x="92" y="164" fill="#334155" fontSize="13">{conditionLabel}</text>
      {xLabel && <text x="266" y="158" fill="#475569" fontSize="12">{xLabel}</text>}
      {yLabel && <text x="30" y="34" fill="#475569" fontSize="12">{yLabel}</text>}
    </svg>
  );
}
