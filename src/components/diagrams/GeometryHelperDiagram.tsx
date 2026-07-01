import type { GeometryHelperSpec } from "../../types";

export default function GeometryHelperDiagram({ spec }: { spec?: GeometryHelperSpec }) {
  const shapeLabel = spec?.shapeLabel ?? "삼각형";
  const angleLabels = spec?.angleLabels ?? ["A", "B", "C"];
  const lengthLabels = spec?.lengthLabels ?? ["a", "b", "c"];
  return (
    <svg className="learning-diagram-svg" viewBox="0 0 320 180" role="img" aria-label="기하 보조선 다이어그램">
      <rect width="320" height="180" rx="18" fill="#f8fbff" />
      <polygon points="82,138 244,138 182,42" fill="#eff6ff" stroke="#2563eb" strokeWidth="3" />
      <line x1="182" y1="42" x2="182" y2="138" stroke="#f97316" strokeWidth="2.5" strokeDasharray="5 5" />
      <path d="M100 138 A18 18 0 0 1 91 122" fill="none" stroke="#64748b" strokeWidth="2" />
      <path d="M226 138 A18 18 0 0 0 235 122" fill="none" stroke="#64748b" strokeWidth="2" />
      <text x="174" y="34" fill="#1e3a8a" fontSize="14">{angleLabels[0] ?? "A"}</text>
      <text x="70" y="154" fill="#1e3a8a" fontSize="14">{angleLabels[1] ?? "B"}</text>
      <text x="246" y="154" fill="#1e3a8a" fontSize="14">{angleLabels[2] ?? "C"}</text>
      <text x="126" y="94" fill="#475569" fontSize="12">{lengthLabels[0] ?? "a"}</text>
      <text x="214" y="94" fill="#475569" fontSize="12">{lengthLabels[1] ?? "b"}</text>
      <text x="154" y="154" fill="#475569" fontSize="12">{lengthLabels[2] ?? "c"}</text>
      <text x="132" y="24" fill="#334155" fontSize="13">{shapeLabel}</text>
    </svg>
  );
}
