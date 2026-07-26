import type {
  DiagramSemanticSpec,
  FigurePreferredRepresentation,
  FigureVerification,
  SheetFigureItem,
} from "../../../types";

export const FIGURE_CLEAN_PROMPT_VERSION = "figure-clean-v1";
export const FIGURE_VERIFICATION_VERSION = "figure-verification-v1";

export interface ResolvedFigureRepresentation {
  kind: FigurePreferredRepresentation | "described_only";
  image?: string;
  needsReview: boolean;
  reason: string;
}

export function automaticPreferredRepresentation(figure: SheetFigureItem): FigurePreferredRepresentation {
  const verification = figure.verification;
  // Legacy saved entries have no source marker; preserve their existing policy.
  const trustedVerification = verification?.verificationSource !== "gpt_self_check";
  if (figure.cleaned?.image && trustedVerification && verification?.status === "verified" && verification.blockingIssues.length === 0 && verification.confidence >= 0.95) {
    return "cleaned";
  }
  if (figure.semanticSpec && trustedVerification && verification?.status === "verified" && verification.blockingIssues.length === 0) {
    return "semantic_render";
  }
  return "original";
}

export function resolveFigureRepresentation(
  figure: SheetFigureItem,
  options: { forPrint?: boolean } = {},
): ResolvedFigureRepresentation {
  if (figure.source === "described_only" && !figure.original?.image && !figure.cleaned?.image && !figure.image) {
    return { kind: "described_only", needsReview: true, reason: "이미지 없이 설명만 저장되어 있습니다." };
  }
  const verification = figure.verification;
  const userSelected = figure.representationSelectionSource === "user" || verification?.userApproved;
  const preferred = userSelected
    ? figure.preferredRepresentation ?? automaticPreferredRepresentation(figure)
    : automaticPreferredRepresentation(figure);
  const printRequiresVerified = options.forPrint && !userSelected;

  if (preferred === "cleaned" && figure.cleaned?.image) {
    const verified = Boolean(verification && verification.blockingIssues.length === 0 && verification.confidence >= 0.95);
    if (!printRequiresVerified || verified) {
      return {
        kind: "cleaned",
        image: figure.cleaned.image,
        needsReview: !verified,
        reason: verified ? "검증된 GPT 정리본" : "검토가 필요한 GPT 정리본",
      };
    }
  }
  if (preferred === "semantic_render" && figure.semanticSpec && verification?.status === "verified") {
    return { kind: "semantic_render", needsReview: false, reason: "검증된 구조 렌더링" };
  }
  const originalImage = figure.original?.image ?? (figure.source === "original" ? figure.image : undefined);
  if (originalImage) return { kind: "original", image: originalImage, needsReview: false, reason: "원본 이미지" };
  if (figure.image) return { kind: figure.source === "gpt_cleaned" ? "cleaned" : "original", image: figure.image, needsReview: Boolean(figure.needsReview), reason: "기존 이미지" };
  return { kind: "described_only", needsReview: true, reason: "표시할 이미지가 없습니다." };
}

export function applyAutomaticFigurePreference(figure: SheetFigureItem): SheetFigureItem {
  if (figure.representationSelectionSource === "user" || figure.verification?.userApproved) return figure;
  const preferredRepresentation = automaticPreferredRepresentation(figure);
  const resolved = resolveFigureRepresentation({ ...figure, preferredRepresentation }, { forPrint: false });
  return {
    ...figure,
    image: resolved.image,
    source: resolved.kind === "cleaned" ? "gpt_cleaned" : resolved.kind === "original" ? "original" : "described_only",
    preferredRepresentation,
    representationSelectionSource: "automatic",
    needsReview: resolved.needsReview,
  };
}

export function shouldReuseCleanedFigure(
  figure: SheetFigureItem,
  sourceImageHash: string,
  promptVersion = FIGURE_CLEAN_PROMPT_VERSION,
): boolean {
  return Boolean(
    figure.cleaned?.image &&
    figure.cleaned.sourceImageHash === sourceImageHash &&
    figure.cleaned.promptVersion === promptVersion,
  );
}

export function verifySemanticSpecAgainstText(spec: DiagramSemanticSpec | undefined, text: string): FigureVerification["warnings"] {
  if (!spec) return [];
  const warnings: FigureVerification["warnings"] = [];
  const relations = spec.relations ?? [];
  const hasRelation = (type: NonNullable<DiagramSemanticSpec["relations"]>[number]["type"]) => relations.some((item) => item.type === type);
  if (/[⊥]|\bperpendicular\b/i.test(text) && !hasRelation("perpendicular")) warnings.push({ type: "text_figure_conflict", message: "본문의 수직 관계가 구조 데이터에 없습니다." });
  if (/[∥]|\bparallel\b/i.test(text) && !hasRelation("parallel")) warnings.push({ type: "text_figure_conflict", message: "본문의 평행 관계가 구조 데이터에 없습니다." });
  if (/접선|tangent/i.test(text) && !hasRelation("tangent")) warnings.push({ type: "text_figure_conflict", message: "본문의 접선 관계가 구조 데이터에 없습니다." });
  if (/중점|midpoint/i.test(text) && !hasRelation("midpoint")) warnings.push({ type: "text_figure_conflict", message: "본문의 중점 관계가 구조 데이터에 없습니다." });
  return warnings;
}
