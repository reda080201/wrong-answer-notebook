import type { DiagramSemanticSpec } from "../../../types";

export default function SemanticFigureView({ spec, title }: { spec: DiagramSemanticSpec; title?: string }) {
  const points = spec.points?.filter((point) => typeof point.x === "number" && typeof point.y === "number") ?? [];
  const pointById = new Map(points.map((point) => [point.id, point]));
  const segments = (spec.segments ?? []).flatMap((segment) => {
    const from = pointById.get(segment.from);
    const to = pointById.get(segment.to);
    return from && to ? [{ segment, from, to }] : [];
  });
  if (!points.length) {
    return <aside className="question-described-figure"><strong>{title || "구조화된 도형"}</strong><p>{spec.constraints?.join(" · ") || "구조 데이터는 저장되어 있으나 좌표 렌더링 정보가 없습니다."}</p></aside>;
  }
  const xs = points.map((point) => point.x as number);
  const ys = points.map((point) => point.y as number);
  const minX = Math.min(...xs) - 1;
  const minY = Math.min(...ys) - 1;
  const width = Math.max(2, Math.max(...xs) - minX + 1);
  const height = Math.max(2, Math.max(...ys) - minY + 1);
  return (
    <figure className="question-source-figure" aria-label={title || "구조화된 수학 도형"}>
      <figcaption>구조 렌더링{title ? ` · ${title}` : ""}</figcaption>
      <svg viewBox={`${minX} ${minY} ${width} ${height}`} role="img">
        {segments.map(({ segment, from, to }, index) => <line key={segment.id ?? index} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeWidth="0.04" strokeDasharray={segment.style === "dashed" ? "0.15 0.1" : undefined} />)}
        {points.map((point) => <g key={point.id}><circle cx={point.x} cy={point.y} r="0.08" fill="currentColor" /><text x={(point.x as number) + 0.12} y={(point.y as number) - 0.12} fontSize="0.35">{point.label ?? point.id}</text></g>)}
      </svg>
    </figure>
  );
}
