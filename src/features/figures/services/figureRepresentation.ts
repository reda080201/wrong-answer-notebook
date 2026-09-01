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

export type FigureVerificationTrust =
  | "trusted_user"
  | "trusted_local"
  | "qualified_automatic"
  | "untrusted_model"
  | "untrusted_missing";

export function classifyFigureVerificationTrust(
  verification?: FigureVerification,
): FigureVerificationTrust {
  if (verification?.verificationSource === "user") return "trusted_user";
  if (verification?.verificationSource === "local_validator") return "trusted_local";
  if (verification?.verificationSource === "second_pass_model" || verification?.verificationSource === "machine_checked") return "qualified_automatic";
  if (verification?.verificationSource === "gpt_self_check") return "untrusted_model";
  return "untrusted_missing";
}

function hasNoBlockingIssues(verification?: FigureVerification): boolean {
  return !verification || verification.blockingIssues.length === 0;
}

function hasNoLocalWarnings(verification?: FigureVerification): boolean {
  return !verification || verification.warnings.length === 0;
}

function hasRequiredSemanticChecks(figure: SheetFigureItem, verification?: FigureVerification): boolean {
  if (!verification?.checks.topologyMatch) return false;
  if (!verification.checks.visualLayoutPreserved) return false;
  const checks = verification.checks;
  const spec = figure.semanticSpec;
  if (!spec) return false;
  if (spec?.points?.length && !checks.pointLabelsMatch) return false;
  if (spec?.numericValues?.length && !checks.numericLabelsMatch) return false;
  if (spec?.segments?.some((segment) => segment.style) && !checks.lineStylesMatch) return false;
  if (spec?.relations?.length && !checks.relationMarksMatch) return false;
  if ((spec?.curves?.length || spec?.axes?.length) && !checks.graphFeaturesMatch) return false;
  if (spec?.regions?.length && !checks.shadingMatch) return false;
  return true;
}

function canAutomaticallyTrust(figure: SheetFigureItem): boolean {
  const verification = figure.verification;
  const trust = classifyFigureVerificationTrust(verification);
  if (trust === "trusted_user") return true;
  if (trust === "trusted_local") return verification?.status === "verified" && hasNoBlockingIssues(verification) && hasNoLocalWarnings(verification) && verification.confidence >= 0.95;
  return trust === "qualified_automatic"
    && figure.processingStatus === "ready"
    && verification?.status === "verified"
    && hasNoBlockingIssues(verification)
    && hasNoLocalWarnings(verification)
    && hasRequiredSemanticChecks(figure, verification);
}

function cleanedReason(figure: SheetFigureItem, verified: boolean): string {
  if (figure.cleaned?.untrustedGeneratedBy || !figure.cleaned?.generatedBy) return "정리본 · 검토 필요";
  const label = figure.cleaned.generatedBy === "deterministic_cleanup"
    ? "정리본 · 자동 이미지 정리"
    : figure.cleaned.generatedBy === "deterministic_redraw"
      ? "정리본 · 결정론적 재구성"
      : "AI 정리본";
  return verified ? label : `${label} · 검토 필요`;
}

export function automaticPreferredRepresentation(figure: SheetFigureItem): FigurePreferredRepresentation {
  const verification = figure.verification;
  const trustedVerification = canAutomaticallyTrust(figure);
  const deterministicCleanupReady = figure.cleaned?.generatedBy === "deterministic_cleanup"
    && figure.processingStatus === "ready"
    && !figure.cleaned.untrustedGeneratedBy
    && !figure.needsReview
    && hasNoBlockingIssues(verification)
    && hasNoLocalWarnings(verification);
  if (figure.cleaned?.image && figure.cleaned.generatedBy && !figure.cleaned.untrustedGeneratedBy && (deterministicCleanupReady || trustedVerification)) {
    return "cleaned";
  }
  if (figure.semanticSpec && trustedVerification && verification?.status === "verified" && hasNoBlockingIssues(verification)) {
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
  if (figure.processingStatus === "rejected") {
    const originalImage = figure.original?.image ?? (figure.source === "original" ? figure.image : undefined);
    if (originalImage) return { kind: "original", image: originalImage, needsReview: true, reason: "원본 이미지 · 정리본 거부됨" };
  }
  const userSelected = figure.representationSelectionSource === "user" || verification?.userApproved;
  const preferred = userSelected
    ? figure.preferredRepresentation ?? automaticPreferredRepresentation(figure)
    : automaticPreferredRepresentation(figure);
  const printRequiresVerified = options.forPrint && !userSelected;

  if (preferred === "cleaned" && figure.cleaned?.image) {
    const verified = canAutomaticallyTrust(figure) || (figure.cleaned.generatedBy === "deterministic_cleanup" && figure.processingStatus === "ready" && !figure.needsReview && hasNoBlockingIssues(verification) && hasNoLocalWarnings(verification));
    if (!printRequiresVerified || verified) {
      return {
        kind: "cleaned",
        image: figure.cleaned.image,
        needsReview: Boolean(figure.needsReview) || !verified,
        reason: cleanedReason(figure, verified),
      };
    }
  }
  if (preferred === "semantic_render" && figure.semanticSpec && (userSelected || verification?.status === "verified")) {
    return { kind: "semantic_render", needsReview: !userSelected && verification?.status !== "verified", reason: userSelected ? "사용자가 선택한 구조 렌더링" : "검증된 구조 렌더링" };
  }
  const originalImage = figure.original?.image ?? (figure.source === "original" ? figure.image : undefined);
  const cleanedNeedsReview = figure.processingStatus === "rejected" || figure.processingStatus === "needs_review" || Boolean(figure.cleaned?.image && !canAutomaticallyTrust(figure));
  if (originalImage) return { kind: "original", image: originalImage, needsReview: Boolean(figure.needsReview || cleanedNeedsReview), reason: "원본 이미지" };
  if (figure.image) return { kind: figure.source === "gpt_cleaned" ? "cleaned" : "original", image: figure.image, needsReview: Boolean(figure.needsReview || cleanedNeedsReview), reason: "기존 이미지" };
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
    processingStatus: figure.processingStatus ?? (resolved.needsReview ? "needs_review" : "ready"),
    needsReview: Boolean(figure.needsReview) || resolved.needsReview,
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
