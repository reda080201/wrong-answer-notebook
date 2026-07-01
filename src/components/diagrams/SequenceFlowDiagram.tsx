import type { SequenceFlowSpec } from "../../types";

export default function SequenceFlowDiagram({ spec }: { spec?: SequenceFlowSpec }) {
  const startLabel = spec?.startLabel ?? "a1";
  const ruleLabel = spec?.ruleLabel ?? "규칙";
  const termLabels = spec?.termLabels ?? ["a1", "a2", "a3", "an"];
  return (
    <svg className="learning-diagram-svg" viewBox="0 0 320 180" role="img" aria-label="수열 흐름 다이어그램">
      <rect width="320" height="180" rx="18" fill="#f8fbff" />
      {[56, 124, 192, 260].map((x, index) => (
        <g key={x}>
          <rect x={x - 25} y="70" width="50" height="38" rx="10" fill={index === 0 ? "#dbeafe" : "#ffffff"} stroke="#2563eb" strokeWidth="2" />
          <text x={x - 12} y="94" fill="#1e3a8a" fontSize="13">{termLabels[index] ?? `a${index + 1}`}</text>
          {index < 3 && (
            <>
              <line x1={x + 28} y1="89" x2={x + 63} y2="89" stroke="#64748b" strokeWidth="2" />
              <path d={`M${x + 63} 89 l-7 -5 v10 z`} fill="#64748b" />
            </>
          )}
        </g>
      ))}
      <text x="42" y="52" fill="#334155" fontSize="13">{startLabel}</text>
      <text x="132" y="48" fill="#9a3412" fontSize="13">{ruleLabel}</text>
      <path d="M78 58 C126 30, 192 30, 242 58" fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="5 5" />
    </svg>
  );
}
