import type { WrongAnswerEntry } from "../types";
import { buildConceptGraph } from "../utils/concepts";

interface ConceptGraphProps {
  entries: WrongAnswerEntry[];
  focusEntry?: WrongAnswerEntry;
  onOpenEntry: (entryId: string) => void;
}

export default function ConceptGraph({ entries, focusEntry, onOpenEntry }: ConceptGraphProps) {
  const graph = buildConceptGraph(entries);
  const focusLabel = focusEntry?.title.trim().toLowerCase();
  const nodes = focusLabel
    ? graph.nodes.filter((node) => {
        if (node.entryId === focusEntry?.id) return true;
        return graph.edges.some(
          (edge) =>
            (edge.from === focusEntry?.id && edge.to === node.id) ||
            (edge.to === `concept:${focusLabel}` && edge.from === node.id),
        );
      })
    : graph.nodes.slice(0, 18);

  if (nodes.length === 0) {
    return <div className="concept-graph-empty">연결된 개념이 없습니다.</div>;
  }

  const width = 640;
  const height = 260;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 95;
  const positioned = nodes.map((node, index) => {
    if (node.entryId === focusEntry?.id) {
      return { ...node, x: centerX, y: centerY };
    }
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length - 1, 1);
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius * 2.1,
      y: centerY + Math.sin(angle) * radius,
    };
  });
  const nodeIds = new Set(positioned.map((node) => node.id));
  const visibleEdges = graph.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));

  const positionOf = (id: string) => positioned.find((node) => node.id === id);

  return (
    <svg className="concept-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="개념 연결 그래프">
      {visibleEdges.map((edge) => {
        const from = positionOf(edge.from);
        const to = positionOf(edge.to);
        if (!from || !to) return null;
        return (
          <line
            key={`${edge.from}-${edge.to}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className="concept-graph-edge"
            strokeWidth={Math.min(6, 1 + (edge.weight ?? 1))}
          />
        );
      })}
      {positioned.map((node) => (
        <g
          key={node.id}
          className={`concept-graph-node concept-graph-node--${node.kind}`}
          transform={`translate(${node.x} ${node.y})`}
          onClick={() => node.entryId && onOpenEntry(node.entryId)}
          tabIndex={node.entryId ? 0 : -1}
          role={node.entryId ? "button" : "img"}
        >
          <circle r={node.entryId === focusEntry?.id ? 30 : 24} />
          <text textAnchor="middle" dominantBaseline="middle">
            {node.label.slice(0, 12)}
          </text>
        </g>
      ))}
    </svg>
  );
}
