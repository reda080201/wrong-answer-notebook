import type { QuestionSolutionHotspot } from "../../types";

export function validSolutionHotspot(value: unknown): value is QuestionSolutionHotspot {
  if (!value || typeof value !== "object") return false;
  const hotspot = value as QuestionSolutionHotspot;
  return typeof hotspot.id === "string" && Boolean(hotspot.id) && typeof hotspot.questionKey === "string" && Boolean(hotspot.questionKey)
    && typeof hotspot.sourcePageImage === "string" && Boolean(hotspot.sourcePageImage)
    && Number.isFinite(hotspot.x) && hotspot.x >= 0 && hotspot.x <= 1 && Number.isFinite(hotspot.y) && hotspot.y >= 0 && hotspot.y <= 1;
}
