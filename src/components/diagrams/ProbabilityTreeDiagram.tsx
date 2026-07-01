import type { ProbabilityTreeSpec } from "../../types";

export default function ProbabilityTreeDiagram({ spec }: { spec?: ProbabilityTreeSpec }) {
  const rootLabel = spec?.rootLabel ?? "시작";
  const branchLabels = spec?.branchLabels ?? ["A", "B", "C", "D"];
  const outcomeLabels = spec?.outcomeLabels ?? ["결과1", "결과2", "결과3", "결과4"];
  return (
    <svg className="learning-diagram-svg" viewBox="0 0 320 180" role="img" aria-label="확률나무 다이어그램">
      <rect width="320" height="180" rx="18" fill="#f8fbff" />
      <circle cx="58" cy="90" r="20" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" />
      <text x="44" y="95" fill="#1e3a8a" fontSize="12">{rootLabel}</text>
      <line x1="78" y1="84" x2="142" y2="46" stroke="#64748b" strokeWidth="2" />
      <line x1="78" y1="96" x2="142" y2="134" stroke="#64748b" strokeWidth="2" />
      <line x1="162" y1="46" x2="238" y2="28" stroke="#64748b" strokeWidth="2" />
      <line x1="162" y1="46" x2="238" y2="66" stroke="#64748b" strokeWidth="2" />
      <line x1="162" y1="134" x2="238" y2="114" stroke="#64748b" strokeWidth="2" />
      <line x1="162" y1="134" x2="238" y2="152" stroke="#64748b" strokeWidth="2" />
      {[46, 134].map((y) => (
        <circle key={y} cx="152" cy={y} r="12" fill="#eff6ff" stroke="#2563eb" />
      ))}
      {[28, 66, 114, 152].map((y, index) => (
        <g key={y}>
          <circle cx="252" cy={y} r="10" fill="#fff7ed" stroke="#f97316" />
          <text x="266" y={y + 4} fill="#334155" fontSize="11">{outcomeLabels[index] ?? `결과${index + 1}`}</text>
        </g>
      ))}
      <text x="98" y="58" fill="#475569" fontSize="11">{branchLabels[0] ?? "A"}</text>
      <text x="98" y="126" fill="#475569" fontSize="11">{branchLabels[1] ?? "B"}</text>
      <text x="190" y="33" fill="#475569" fontSize="11">{branchLabels[2] ?? "C"}</text>
      <text x="190" y="121" fill="#475569" fontSize="11">{branchLabels[3] ?? "D"}</text>
    </svg>
  );
}
