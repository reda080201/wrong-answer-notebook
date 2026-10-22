import type { FigurePreferredRepresentation, SheetFigureItem } from "../../../types";

/** Only call in response to an actual comparison/selection action. */
export function selectFigureRepresentation(figure: SheetFigureItem, kind: FigurePreferredRepresentation, comparisonReady: boolean): Partial<SheetFigureItem> {
  if (kind !== "original" && (!comparisonReady || figure.processingStatus === "rejected" || figure.verification?.blockingIssues.length)) throw new Error("원본과 정상 후보를 비교한 후 선택해 주세요.");
  const image = kind === "original" ? figure.original?.image : kind === "cleaned" ? figure.cleaned?.image : undefined;
  if ((kind !== "semantic_render" && !image) || (kind === "semantic_render" && !figure.semanticSpec)) throw new Error("선택할 그림이 없습니다.");
  return { preferredRepresentation: kind, representationSelectionSource: "user", image, source: kind === "cleaned" ? "gpt_cleaned" : kind === "original" ? "original" : "described_only", needsReview: false, verification: { ...(figure.verification ?? { status: "needs_review", confidence: 0, checks: {}, blockingIssues: [], warnings: [] }), userApproved: kind !== "original" && comparisonReady, verificationSource: "user", verifiedAt: new Date().toISOString() } };
}
