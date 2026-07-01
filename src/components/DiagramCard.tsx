import type { DiagramSpec, LearningDiagramType } from "../types";
import AbsoluteValueCornerDiagram from "./diagrams/AbsoluteValueCornerDiagram";
import DerivativeTangentDiagram from "./diagrams/DerivativeTangentDiagram";
import PiecewiseDifferentiabilityDiagram from "./diagrams/PiecewiseDifferentiabilityDiagram";

const DIAGRAM_LABELS: Record<LearningDiagramType, string> = {
  "derivative-tangent": "미분계수와 접선",
  "absolute-value-corner": "절댓값 뾰족점",
  "piecewise-differentiability": "구간별 미분가능성",
};

function isLearningDiagramType(value: unknown): value is LearningDiagramType {
  return (
    value === "derivative-tangent" ||
    value === "absolute-value-corner" ||
    value === "piecewise-differentiability"
  );
}

function isDiagramSpec(value: unknown): value is DiagramSpec {
  return Boolean(value && typeof value === "object" && isLearningDiagramType((value as DiagramSpec).type));
}

export default function DiagramCard({
  diagramType,
  diagramSpec,
}: {
  diagramType?: string;
  diagramSpec?: DiagramSpec;
}) {
  const spec = isDiagramSpec(diagramSpec) ? diagramSpec : undefined;
  const type = spec?.type ?? diagramType;
  if (!isLearningDiagramType(type)) return null;
  const title = spec?.title?.trim() || DIAGRAM_LABELS[type];

  return (
    <figure className="learning-diagram-card" aria-label={`${title} 다이어그램`}>
      {type === "derivative-tangent" && (
        <DerivativeTangentDiagram spec={spec?.type === "derivative-tangent" ? spec : undefined} />
      )}
      {type === "absolute-value-corner" && (
        <AbsoluteValueCornerDiagram spec={spec?.type === "absolute-value-corner" ? spec : undefined} />
      )}
      {type === "piecewise-differentiability" && (
        <PiecewiseDifferentiabilityDiagram spec={spec?.type === "piecewise-differentiability" ? spec : undefined} />
      )}
      <figcaption>{title}</figcaption>
      {spec?.highlights?.length ? (
        <ul className="learning-diagram-highlights">
          {spec.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
