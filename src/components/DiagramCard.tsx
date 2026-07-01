import type { DiagramSpec, LearningDiagramType } from "../types";
import AbsoluteValueCornerDiagram from "./diagrams/AbsoluteValueCornerDiagram";
import CoordinateGraphDiagram from "./diagrams/CoordinateGraphDiagram";
import DerivativeTangentDiagram from "./diagrams/DerivativeTangentDiagram";
import GeometryHelperDiagram from "./diagrams/GeometryHelperDiagram";
import NormalDistributionDiagram from "./diagrams/NormalDistributionDiagram";
import PiecewiseDifferentiabilityDiagram from "./diagrams/PiecewiseDifferentiabilityDiagram";
import ProbabilityTreeDiagram from "./diagrams/ProbabilityTreeDiagram";
import SequenceFlowDiagram from "./diagrams/SequenceFlowDiagram";
import TrigUnitCircleDiagram from "./diagrams/TrigUnitCircleDiagram";
import VennDiagram from "./diagrams/VennDiagram";

const DIAGRAM_LABELS: Record<LearningDiagramType, string> = {
  "derivative-tangent": "미분계수와 접선",
  "absolute-value-corner": "절댓값 뾰족점",
  "piecewise-differentiability": "구간별 미분가능성",
  "coordinate-graph": "좌표 그래프",
  "normal-distribution": "정규분포",
  "probability-tree": "확률나무",
  "venn-diagram": "벤 다이어그램",
  "geometry-helper": "기하 보조선",
  "trig-unit-circle": "삼각함수 단위원",
  "sequence-flow": "수열 흐름",
};

function isLearningDiagramType(value: unknown): value is LearningDiagramType {
  return (
    value === "derivative-tangent" ||
    value === "absolute-value-corner" ||
    value === "piecewise-differentiability" ||
    value === "coordinate-graph" ||
    value === "normal-distribution" ||
    value === "probability-tree" ||
    value === "venn-diagram" ||
    value === "geometry-helper" ||
    value === "trig-unit-circle" ||
    value === "sequence-flow"
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
      {type === "coordinate-graph" && (
        <CoordinateGraphDiagram spec={spec?.type === "coordinate-graph" ? spec : undefined} />
      )}
      {type === "normal-distribution" && (
        <NormalDistributionDiagram spec={spec?.type === "normal-distribution" ? spec : undefined} />
      )}
      {type === "probability-tree" && (
        <ProbabilityTreeDiagram spec={spec?.type === "probability-tree" ? spec : undefined} />
      )}
      {type === "venn-diagram" && (
        <VennDiagram spec={spec?.type === "venn-diagram" ? spec : undefined} />
      )}
      {type === "geometry-helper" && (
        <GeometryHelperDiagram spec={spec?.type === "geometry-helper" ? spec : undefined} />
      )}
      {type === "trig-unit-circle" && (
        <TrigUnitCircleDiagram spec={spec?.type === "trig-unit-circle" ? spec : undefined} />
      )}
      {type === "sequence-flow" && (
        <SequenceFlowDiagram spec={spec?.type === "sequence-flow" ? spec : undefined} />
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
