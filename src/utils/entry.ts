import { v4 as uuidv4 } from "uuid";
import type {
  ChecklistItem,
  DiagramSpec,
  DiagramSpecParamValue,
  DiagramSpecParams,
  Difficulty,
  EntryKind,
  ExplanationPart,
  LearningBlock,
  LearningBlockType,
  LearningDiagramType,
  LectureSourceType,
  ReviewAttempt,
  ReviewResult,
  ReviewState,
  QuestionContentSegment,
  SheetFigureItem,
  SheetAnswerItem,
  StructuredQuestion,
  SupplementalAppliedField,
  SupplementalResource,
  SupplementalResourceKind,
  SimilarQuestionLink,
  WrongAnswerEntry,
} from "../types";
import { normalizeMistakeAnalysis } from "./mistakeAnalysis";
import { normalizeImportAudit, normalizeRejectedNotes, scrubRejectedNotesFromStructuredQuestions } from "./importAudit";
import { normalizeQuestionMeta, normalizeQuestionNumber } from "./questionMeta";
import { normalizeReviewState, isValidIsoDate } from "./reviewNormalization";
import { applyAutomaticFigurePreference } from "../features/figures/services/figureRepresentation";
import { maxAnswerDifficultyScore, normalizeDifficultyScore } from "./difficulty";
import { normalizeSheetGroup } from "./sheetGroup";
import { normalizeProblemSource } from "./problemSource";
import {
  isLearningImportance,
  isLearningReviewStatus,
  isLearningSubjectDomain,
  normalizeChoiceExamples,
  normalizeLearningSourceReferences,
  normalizePassageExamples,
  normalizeSubjectLearningMetadata,
} from "../features/learning/model/learningMetadata";

function isEntryKind(v: unknown): v is EntryKind {
  return v === "wrong_answer" || v === "problem_sheet" || v === "concept" || v === "lecture";
}

function isLectureSourceType(v: unknown): v is LectureSourceType {
  return v === "html" || v === "md" || v === "txt" || v === "json";
}

function isDifficulty(v: unknown): v is Difficulty {
  return v === "high" || v === "medium" || v === "low" || v === "none";
}

const SUPPLEMENTAL_KINDS = new Set<SupplementalResourceKind>([
  "answer_key",
  "solution",
  "correction",
  "source_pages",
  "lecture",
  "concept",
  "other",
]);

const SUPPLEMENTAL_FIELDS = new Set<SupplementalAppliedField>([
  "answerKey",
  "explanationParts",
  "figures",
  "sourcePageImages",
  "learningBlocks",
]);

function normalizeSupplementalResources(raw: unknown): SupplementalResource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => {
      const kind = SUPPLEMENTAL_KINDS.has(item.kind as SupplementalResourceKind)
        ? item.kind as SupplementalResourceKind
        : "other";
      const appliedFields = Array.isArray(item.appliedFields)
        ? item.appliedFields.filter((field): field is SupplementalAppliedField => SUPPLEMENTAL_FIELDS.has(field as SupplementalAppliedField))
        : [];
      return {
        ...item,
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : uuidv4(),
        kind,
        title: typeof item.title === "string" ? item.title.trim() : "추가 자료",
        createdAt: isValidIsoDate(item.createdAt) ? item.createdAt : new Date().toISOString(),
        updatedAt: isValidIsoDate(item.updatedAt) ? item.updatedAt : new Date().toISOString(),
        sourceFilename: typeof item.sourceFilename === "string" ? item.sourceFilename : undefined,
        sourceEntryId: typeof item.sourceEntryId === "string" ? item.sourceEntryId : undefined,
        questionNumbers: Array.isArray(item.questionNumbers) ? item.questionNumbers.map(String).filter(Boolean) : undefined,
        images: Array.isArray(item.images) ? item.images.map(String).filter(Boolean) : undefined,
        appliedFields,
      };
    });
}

function normalizeSimilarQuestionLinks(raw: unknown): SimilarQuestionLink[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Partial<SimilarQuestionLink>;
    if (typeof value.targetEntryId !== "string" || typeof value.targetQuestionNumber !== "string") return [];
    const targetQuestionNumber = normalizeQuestionNumber(value.targetQuestionNumber);
    const uniqueKey = `${value.targetEntryId}:${targetQuestionNumber}`;
    if (!targetQuestionNumber || seen.has(uniqueKey)) return [];
    seen.add(uniqueKey);
    return [{ ...value, id: typeof value.id === "string" && value.id ? value.id : uuidv4(), targetEntryId: value.targetEntryId, targetQuestionNumber, score: normalizeDifficultyScore(value.score), reasons: Array.isArray(value.reasons) ? value.reasons.filter((item): item is string => typeof item === "string") : [], sharedConcepts: Array.isArray(value.sharedConcepts) ? value.sharedConcepts.filter((item): item is string => typeof item === "string") : [], differences: Array.isArray(value.differences) ? value.differences.filter((item): item is string => typeof item === "string") : [], source: value.source === "gemini" || value.source === "local" ? value.source : "manual", status: value.status === "approved" || value.status === "rejected" ? value.status : "suggested", createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(), updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString() } satisfies SimilarQuestionLink];
  });
}

function normalizeAnswerDifficulty(v: unknown): Exclude<Difficulty, "none"> | undefined {
  return v === "high" || v === "medium" || v === "low" ? v : undefined;
}

const LEARNING_DIAGRAM_TYPE_ALIASES: Record<string, LearningDiagramType> = {
  "derivative-tangent": "derivative-tangent",
  derivative_tangent: "derivative-tangent",
  "absolute-value-corner": "absolute-value-corner",
  absolute_value_corner: "absolute-value-corner",
  "piecewise-differentiability": "piecewise-differentiability",
  piecewise_differentiability: "piecewise-differentiability",
  "coordinate-graph": "coordinate-graph",
  coordinate_graph: "coordinate-graph",
  "normal-distribution": "normal-distribution",
  normal_distribution: "normal-distribution",
  "probability-tree": "probability-tree",
  probability_tree: "probability-tree",
  "venn-diagram": "venn-diagram",
  venn_diagram: "venn-diagram",
  "geometry-helper": "geometry-helper",
  geometry_helper: "geometry-helper",
  "trig-unit-circle": "trig-unit-circle",
  trig_unit_circle: "trig-unit-circle",
  "sequence-flow": "sequence-flow",
  sequence_flow: "sequence-flow",
};

export function normalizeLearningDiagramType(value: unknown): LearningDiagramType | undefined {
  if (typeof value !== "string") return undefined;
  return LEARNING_DIAGRAM_TYPE_ALIASES[value.trim().toLowerCase()];
}

const DIAGRAM_SPEC_LABEL_LIMIT = 80;
const DIAGRAM_SPEC_LIST_LIMIT = 6;

function safeDiagramLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > DIAGRAM_SPEC_LABEL_LIMIT) return undefined;
  if (/<\/?(script|svg|iframe|object|embed|img|html|body)\b/i.test(trimmed)) return undefined;
  if (/data:image\/|base64,/i.test(trimmed)) return undefined;
  return trimmed;
}

function safeDiagramLabelList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map(safeDiagramLabel)
    .filter((item): item is string => Boolean(item))
    .slice(0, DIAGRAM_SPEC_LIST_LIMIT);
  return items.length ? items : undefined;
}

function safeDiagramParamValue(value: unknown, depth = 0): DiagramSpecParamValue | undefined {
  if (depth > 5) return undefined;
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 180) return undefined;
    if (/<\/?(script|svg|iframe|object|embed|img|html|body|canvas)\b/i.test(trimmed)) return undefined;
    if (/data:image\/|base64,/i.test(trimmed)) return undefined;
    return trimmed;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => safeDiagramParamValue(item, depth + 1))
      .filter((item): item is DiagramSpecParamValue => item !== undefined)
      .slice(0, 16);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, 24)
      .map(([key, item]) => {
        const safeKey = key.trim().replace(/[^0-9A-Za-z가-힣_-]/g, "").slice(0, 48);
        const safeValue = safeDiagramParamValue(item, depth + 1);
        return safeKey && safeValue !== undefined ? [safeKey, safeValue] as const : undefined;
      })
      .filter((item): item is readonly [string, DiagramSpecParamValue] => Boolean(item));
    return entries.length ? Object.fromEntries(entries) as DiagramSpecParams : undefined;
  }
  return undefined;
}

function safeDiagramParams(value: unknown): DiagramSpecParams | undefined {
  const params = safeDiagramParamValue(value);
  return params && typeof params === "object" && !Array.isArray(params) ? params as DiagramSpecParams : undefined;
}

export function normalizeDiagramSpec(raw: unknown): DiagramSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const type = normalizeLearningDiagramType(value.type) ?? normalizeLearningDiagramType(value.diagramType);
  if (!type) return undefined;

  const base = {
    type,
    title: safeDiagramLabel(value.title),
    xLabel: safeDiagramLabel(value.xLabel),
    yLabel: safeDiagramLabel(value.yLabel),
    highlights: safeDiagramLabelList(value.highlights),
    params: safeDiagramParams(value.params),
  };

  if (type === "derivative-tangent") {
    return {
      ...base,
      type: "derivative-tangent",
      pointLabel: safeDiagramLabel(value.pointLabel),
      functionLabel: safeDiagramLabel(value.functionLabel),
      tangentLabel: safeDiagramLabel(value.tangentLabel),
      slopeLabel: safeDiagramLabel(value.slopeLabel),
    };
  }

  if (type === "absolute-value-corner") {
    return {
      ...base,
      type: "absolute-value-corner",
      cornerLabel: safeDiagramLabel(value.cornerLabel),
      leftSlopeLabel: safeDiagramLabel(value.leftSlopeLabel),
      rightSlopeLabel: safeDiagramLabel(value.rightSlopeLabel),
    };
  }

  if (type === "piecewise-differentiability") {
    return {
      ...base,
      type: "piecewise-differentiability",
      boundaryLabel: safeDiagramLabel(value.boundaryLabel),
      leftLabel: safeDiagramLabel(value.leftLabel),
      rightLabel: safeDiagramLabel(value.rightLabel),
      conditionLabel: safeDiagramLabel(value.conditionLabel),
    };
  }

  if (type === "coordinate-graph") {
    return {
      ...base,
      type: "coordinate-graph",
      curveLabel: safeDiagramLabel(value.curveLabel),
      pointLabels: safeDiagramLabelList(value.pointLabels),
      interceptLabel: safeDiagramLabel(value.interceptLabel),
    };
  }

  if (type === "normal-distribution") {
    return {
      ...base,
      type: "normal-distribution",
      meanLabel: safeDiagramLabel(value.meanLabel),
      sigmaLabels: safeDiagramLabelList(value.sigmaLabels),
      shadedRegionLabel: safeDiagramLabel(value.shadedRegionLabel),
    };
  }

  if (type === "probability-tree") {
    return {
      ...base,
      type: "probability-tree",
      rootLabel: safeDiagramLabel(value.rootLabel),
      branchLabels: safeDiagramLabelList(value.branchLabels),
      outcomeLabels: safeDiagramLabelList(value.outcomeLabels),
    };
  }

  if (type === "venn-diagram") {
    return {
      ...base,
      type: "venn-diagram",
      setLabels: safeDiagramLabelList(value.setLabels),
      intersectionLabel: safeDiagramLabel(value.intersectionLabel),
      outsideLabel: safeDiagramLabel(value.outsideLabel),
    };
  }

  if (type === "geometry-helper") {
    return {
      ...base,
      type: "geometry-helper",
      shapeLabel: safeDiagramLabel(value.shapeLabel),
      angleLabels: safeDiagramLabelList(value.angleLabels),
      lengthLabels: safeDiagramLabelList(value.lengthLabels),
    };
  }

  if (type === "trig-unit-circle") {
    return {
      ...base,
      type: "trig-unit-circle",
      angleLabel: safeDiagramLabel(value.angleLabel),
      sinLabel: safeDiagramLabel(value.sinLabel),
      cosLabel: safeDiagramLabel(value.cosLabel),
      pointLabel: safeDiagramLabel(value.pointLabel),
    };
  }

  return {
    ...base,
    type: "sequence-flow",
    startLabel: safeDiagramLabel(value.startLabel),
    ruleLabel: safeDiagramLabel(value.ruleLabel),
    termLabels: safeDiagramLabelList(value.termLabels),
  };
}

function isLearningBlockType(v: unknown): v is LearningBlockType {
  return (
    v === "concept" ||
    v === "formula" ||
    v === "routine" ||
    v === "warning" ||
    v === "review" ||
    v === "checklist" ||
    v === "diagram"
  );
}

function isFigureSource(v: unknown): v is SheetFigureItem["source"] {
  return v === "original" || v === "gpt_cleaned" || v === "described_only";
}

function normalizeReview(raw: unknown, mastered = false): ReviewState | undefined {
  const value = raw && typeof raw === "object" ? raw as Partial<ReviewState> : undefined;
  const defaultPhase = mastered
    ? value?.dueAt
      ? "long_term"
      : "archived"
    : "learning";
  return normalizeReviewState(raw, { defaultPhase });
}

function normalizeChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<ChecklistItem> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      id: item.id || uuidv4(),
      text: item.text ?? "",
      checked: Boolean(item.checked),
    }))
    .filter((item) => item.text.trim());
}

function normalizeImportantPoints(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n|[,;、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeChoiceJudgements(raw: unknown): Array<{ marker: string; text: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): { marker: string; text: string } | null => {
      if (typeof item === "string") {
        const [marker = "", ...rest] = item.split(/[:：]/);
        const text = rest.join(":").trim();
        return text ? { marker: marker.trim(), text } : { marker: "", text: item.trim() };
      }
      if (!item || typeof item !== "object") return null;
      const typed = item as { marker?: unknown; text?: unknown; judgement?: unknown; judgment?: unknown };
      const text = `${typed.text ?? typed.judgement ?? typed.judgment ?? ""}`.trim();
      if (!text) return null;
      return {
        marker: `${typed.marker ?? ""}`.trim(),
        text,
      };
    })
    .filter((item): item is { marker: string; text: string } => Boolean(item));
}

export function normalizeAnswerKey(raw: unknown): SheetAnswerItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => Boolean(item && typeof item === "object"))
    .map((item) => item as Partial<SheetAnswerItem>)
    .map((item) => ({
      id: item.id || uuidv4(),
      questionNumber: `${item.questionNumber ?? ""}`.trim(),
      answer: `${item.answer ?? ""}`.trim(),
      explanation: `${item.explanation ?? ""}`.trim(),
      strategy: `${item.strategy ?? ""}`.trim(),
      steps: normalizeImportantPoints(item.steps),
      choiceJudgements: normalizeChoiceJudgements(item.choiceJudgements),
      wrongPoint: `${item.wrongPoint ?? ""}`.trim(),
      reviewPoint: `${item.reviewPoint ?? ""}`.trim(),
      notes: `${item.notes ?? ""}`.trim(),
      mistakeAnalysis: item.mistakeAnalysis
        ? normalizeMistakeAnalysis(item.mistakeAnalysis)
        : undefined,
      importantPoints: normalizeImportantPoints(item.importantPoints),
      difficulty: normalizeAnswerDifficulty(item.difficulty),
      difficultyScore: normalizeDifficultyScore(item.difficultyScore),
      concepts: normalizeImportantPoints(item.concepts),
      diagramType: normalizeLearningDiagramType(item.diagramType),
      diagramSpec: normalizeDiagramSpec(item.diagramSpec),
      needsReview: Boolean(item.needsReview),
      sourceNote: `${item.sourceNote ?? ""}`.trim(),
    }))
    .filter(
      (item) =>
        item.questionNumber ||
        item.answer ||
        item.explanation ||
        item.strategy ||
        item.steps.length ||
        item.choiceJudgements.length ||
        item.wrongPoint ||
        item.reviewPoint ||
        item.notes ||
        item.importantPoints.length ||
        item.diagramType ||
        item.diagramSpec,
    );
}

export function normalizeLearningBlocks(raw: unknown): LearningBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => Boolean(item && typeof item === "object"))
    .map((item) => item as Partial<LearningBlock> & Record<string, unknown>)
    .map((item) => {
      const items = Array.isArray(item.items)
        ? item.items
            .map((value) => `${value ?? ""}`.trim())
            .filter(Boolean)
            .map((value) => `- ${value}`)
            .join("\n")
        : "";
      const content = [
        item.content,
        item.body,
        item.formula,
        items,
        item.description,
      ]
        .map((value) => `${value ?? ""}`.trim())
        .find(Boolean) ?? "";
      return {
        id: item.id || uuidv4(),
        type: isLearningBlockType(item.type) ? item.type : "concept",
        title: `${item.title ?? ""}`.trim(),
        content,
        sourceQuestionNumber: item.sourceQuestionNumber
          ? `${item.sourceQuestionNumber}`.trim()
          : undefined,
        diagramType: normalizeLearningDiagramType(item.diagramType),
        diagramSpec: normalizeDiagramSpec(item.diagramSpec),
        images: Array.isArray(item.images)
          ? item.images.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
          : undefined,
        figureIds: Array.isArray(item.figureIds)
          ? item.figureIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
          : undefined,
        subjectDomain: isLearningSubjectDomain(item.subjectDomain)
          ? item.subjectDomain
          : undefined,
        unit: typeof item.unit === "string" ? item.unit.trim() || undefined : undefined,
        subunit: typeof item.subunit === "string" ? item.subunit.trim() || undefined : undefined,
        keywords: Array.isArray(item.keywords)
          ? item.keywords.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
          : undefined,
        importance: isLearningImportance(item.importance) ? item.importance : undefined,
        reviewStatus: isLearningReviewStatus(item.reviewStatus) ? item.reviewStatus : undefined,
        passageExamples: normalizePassageExamples(item.passageExamples),
        choiceExamples: normalizeChoiceExamples(item.choiceExamples),
        commonTraps: Array.isArray(item.commonTraps)
          ? item.commonTraps.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
          : undefined,
        relatedConcepts: Array.isArray(item.relatedConcepts)
          ? item.relatedConcepts.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
          : undefined,
        sourceReferences: normalizeLearningSourceReferences(item.sourceReferences),
        subjectMetadata: normalizeSubjectLearningMetadata(item.subjectMetadata),
        similarQuestionLinks: normalizeSimilarQuestionLinks(item.similarQuestionLinks),
      };
    })
    .filter((item) => item.title || item.content || item.diagramType || item.diagramSpec || item.images?.length || item.figureIds?.length);
}

export function normalizeFigures(raw: unknown): SheetFigureItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => Boolean(item && typeof item === "object"))
    .map((item) => item as Partial<SheetFigureItem>)
    .map((item) => ({
      id: item.id || uuidv4(),
      questionNumber: `${item.questionNumber ?? ""}`.trim(),
      title: `${item.title ?? ""}`.trim(),
      caption: `${item.caption ?? ""}`.trim(),
      image: item.image ? `${item.image}`.trim() : undefined,
      source: isFigureSource(item.source) ? item.source : "gpt_cleaned",
      needsReview: Boolean(item.needsReview),
      original: normalizeFigureOriginal(item.original),
      cleaned: normalizeFigureCleaned(item.cleaned),
      semanticSpec: normalizeDiagramSemanticSpec(item.semanticSpec),
      verification: normalizeFigureVerification(item.verification),
      preferredRepresentation: item.preferredRepresentation === "cleaned" || item.preferredRepresentation === "semantic_render" || item.preferredRepresentation === "original" ? item.preferredRepresentation : undefined,
      representationSelectionSource: item.representationSelectionSource === "user" ? "user" as const : item.representationSelectionSource === "automatic" ? "automatic" as const : undefined,
      placement: normalizeFigurePlacement(item.placement),
    }))
    .filter((item) => item.questionNumber || item.title || item.caption || item.image || item.original?.image || item.cleaned?.image || item.semanticSpec)
    .map(applyAutomaticFigurePreference);
}

function normalizeFigureOriginal(raw: unknown): SheetFigureItem["original"] {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.image !== "string" || !value.image.trim()) return undefined;
  const crop = value.crop && typeof value.crop === "object" ? value.crop as Record<string, unknown> : undefined;
  const normalizedCrop = crop && [crop.x, crop.y, crop.width, crop.height].every((item) => typeof item === "number" && Number.isFinite(item))
    ? { x: Number(crop.x), y: Number(crop.y), width: Number(crop.width), height: Number(crop.height) }
    : undefined;
  return { image: value.image.trim(), sourcePageImage: typeof value.sourcePageImage === "string" ? value.sourcePageImage.trim() || undefined : undefined, crop: normalizedCrop };
}

function normalizeFigureCleaned(raw: unknown): SheetFigureItem["cleaned"] {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.image !== "string" || !value.image.trim() || typeof value.sourceImageHash !== "string" || typeof value.promptVersion !== "string") return undefined;
  return { image: value.image.trim(), generatedBy: "gpt", generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : "", sourceImageHash: value.sourceImageHash, promptVersion: value.promptVersion };
}

function normalizeDiagramSemanticSpec(raw: unknown): SheetFigureItem["semanticSpec"] {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const types = ["function_graph", "coordinate_geometry", "plane_geometry", "solid_geometry", "probability_tree", "table", "venn_diagram", "number_line", "sequence_diagram", "custom_math_diagram"];
  if (typeof value.type !== "string" || !types.includes(value.type)) return undefined;
  return structuredClone(value) as unknown as SheetFigureItem["semanticSpec"];
}

function normalizeFigureVerification(raw: unknown): SheetFigureItem["verification"] {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (value.status !== "verified" && value.status !== "needs_review" && value.status !== "rejected") return undefined;
  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence) ? Math.min(1, Math.max(0, value.confidence)) : 0;
  return {
    status: value.status,
    confidence,
    checks: value.checks && typeof value.checks === "object" ? structuredClone(value.checks) as NonNullable<SheetFigureItem["verification"]>["checks"] : {},
    blockingIssues: Array.isArray(value.blockingIssues) ? structuredClone(value.blockingIssues) as NonNullable<SheetFigureItem["verification"]>["blockingIssues"] : [],
    warnings: Array.isArray(value.warnings) ? structuredClone(value.warnings) as NonNullable<SheetFigureItem["verification"]>["warnings"] : [],
    userApproved: Boolean(value.userApproved),
    verificationSource: value.verificationSource === "gpt_self_check" || value.verificationSource === "second_pass_model" || value.verificationSource === "local_validator" || value.verificationSource === "user"
      ? value.verificationSource
      : undefined,
    verifiedAt: typeof value.verifiedAt === "string" ? value.verifiedAt : undefined,
    verifier: typeof value.verifier === "string" ? value.verifier : undefined,
  };
}

function normalizeFigurePlacement(raw: unknown): SheetFigureItem["placement"] {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const questionNumber = `${value.questionNumber ?? ""}`.trim();
  if (!questionNumber) return undefined;
  const order = typeof value.order === "number" && Number.isFinite(value.order)
    ? Math.max(0, Math.floor(value.order))
    : undefined;
  const beforeChoiceIndex = typeof value.beforeChoiceIndex === "number" && Number.isFinite(value.beforeChoiceIndex)
    ? Math.max(0, Math.floor(value.beforeChoiceIndex))
    : undefined;
  return {
    questionNumber,
    afterSegmentId: typeof value.afterSegmentId === "string" && value.afterSegmentId.trim()
      ? value.afterSegmentId.trim()
      : undefined,
    beforeChoiceIndex,
    order,
  };
}

export function normalizeQuestionContentSegments(raw: unknown): WrongAnswerEntry["questionContentSegments"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const normalized = Object.entries(raw as Record<string, unknown>).flatMap(([questionNumber, segments]) => {
    if (!Array.isArray(segments)) return [];
    const items = segments.flatMap((segment, index): QuestionContentSegment[] => {
      if (!segment || typeof segment !== "object") return [];
      const value = segment as Record<string, unknown>;
      const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : `segment-${index + 1}`;
      if (value.type === "text" && typeof value.text === "string") return [{ id, type: "text", text: value.text }];
      if (value.type === "condition" && typeof value.text === "string") return [{ id, type: "condition", text: value.text, label: typeof value.label === "string" ? value.label : undefined }];
      if (value.type === "equation" && typeof value.latex === "string") return [{ id, type: "equation", latex: value.latex, display: Boolean(value.display) }];
      if (value.type === "table" && Array.isArray(value.rows) && value.rows.every((row) => Array.isArray(row))) return [{ id, type: "table", rows: value.rows.map((row) => (row as unknown[]).map((cell) => `${cell ?? ""}`)) }];
      if (value.type === "figure" && typeof value.figureId === "string" && value.figureId.trim()) return [{ id, type: "figure", figureId: value.figureId.trim() }];
      return [];
    });
    return items.length ? [[normalizeQuestionNumber(questionNumber) || questionNumber, items] as const] : [];
  });
  return normalized.length ? Object.fromEntries(normalized) : undefined;
}

export class StructuredQuestionNormalizationError extends Error {
  readonly index: number;

  constructor(index: number, reason: string) {
    super(`structuredQuestions[${index}] ${reason}`);
    this.name = "StructuredQuestionNormalizationError";
    this.index = index;
  }
}

function isMultipleChoiceQuestion(questionType: unknown): boolean {
  if (typeof questionType !== "string") return false;
  return ["multiple_choice", "multiple-choice", "multiple choice", "choice", "객관식"].includes(questionType.trim().toLowerCase());
}

function missingChoicesWarning(warning: string | undefined): string {
  const message = "객관식 문항의 선택지가 없습니다.";
  if (!warning) return message;
  return warning.includes(message) ? warning : `${warning} ${message}`;
}

export function normalizeStructuredQuestions(raw: unknown): StructuredQuestion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const questions = raw.map((item, index): StructuredQuestion => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new StructuredQuestionNormalizationError(index, "must be an object");
    }
    const value = item as Record<string, unknown>;
    const questionNumber = normalizeQuestionNumber(`${value.questionNumber ?? ""}`);
    const questionText = typeof value.questionText === "string" ? value.questionText.trim() : "";
    if (!questionNumber) throw new StructuredQuestionNormalizationError(index, "has an invalid questionNumber");
    if (!questionText) throw new StructuredQuestionNormalizationError(index, "has an empty questionText");
    const contentSegments = normalizeQuestionContentSegments({ [questionNumber]: value.contentSegments })?.[questionNumber] ?? [];
    const list = (input: unknown) => Array.isArray(input)
      ? input.filter((part): part is string => typeof part === "string").map((part) => part.trim()).filter(Boolean)
      : [];
    const sourceValue = value.source && typeof value.source === "object" && !Array.isArray(value.source)
      ? value.source as Record<string, unknown>
      : undefined;
    const source = sourceValue ? {
      title: typeof sourceValue.title === "string" ? sourceValue.title.trim() || undefined : undefined,
      page: typeof sourceValue.page === "number" && Number.isFinite(sourceValue.page) ? sourceValue.page : undefined,
      reference: typeof sourceValue.reference === "string" ? sourceValue.reference.trim() || undefined : undefined,
    } : undefined;
    const questionType = typeof value.questionType === "string" ? value.questionType.trim() || undefined : undefined;
    const choices = list(value.choices);
    return {
      questionNumber,
      section: typeof value.section === "string" ? value.section.trim() || undefined : undefined,
      questionType,
      points: typeof value.points === "number" && Number.isFinite(value.points) ? value.points : undefined,
      questionText,
      conditions: list(value.conditions),
      equations: list(value.equations),
      choices,
      contentSegments,
      source: source as StructuredQuestion["source"],
      needsReview: Boolean(value.needsReview) || (isMultipleChoiceQuestion(questionType) && choices.length === 0),
      warning: isMultipleChoiceQuestion(questionType) && choices.length === 0
        ? missingChoicesWarning(typeof value.warning === "string" ? value.warning.trim() || undefined : undefined)
        : typeof value.warning === "string" ? value.warning.trim() || undefined : undefined,
      figureIds: list(value.figureIds),
    };
  });
  return questions.length ? questions : undefined;
}

function normalizeReviewAttempts(raw: unknown, entryId: string): ReviewAttempt[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<ReviewAttempt> => Boolean(item && typeof item === "object"))
    .filter((item) => item.result === "again" || item.result === "hard" || item.result === "good")
    .map((item) => {
      const result = item.result as ReviewResult;
      return {
      id: item.id || uuidv4(),
      entryId: item.entryId || entryId,
      questionNumber: item.questionNumber ? normalizeQuestionNumber(item.questionNumber) : undefined,
      reviewedAt: isValidIsoDate(item.reviewedAt) ? item.reviewedAt : new Date().toISOString(),
      answerText: typeof item.answerText === "string" ? item.answerText.trim() : undefined,
      correct: Boolean(item.correct),
      durationSeconds: typeof item.durationSeconds === "number" && item.durationSeconds >= 0
        ? Math.floor(item.durationSeconds)
        : undefined,
      confidence: item.confidence === "low" || item.confidence === "medium" || item.confidence === "high"
        ? item.confidence
        : undefined,
      hintUsed: Boolean(item.hintUsed),
      blockedStage: item.blockedStage === "concept" || item.blockedStage === "interpretation" || item.blockedStage === "strategy" || item.blockedStage === "calculation" || item.blockedStage === "verification"
        ? item.blockedStage
        : undefined,
      mistakeCause: item.mistakeCause === "calculation" || item.mistakeCause === "condition_misread" || item.mistakeCause === "concept_gap" || item.mistakeCause === "strategy_gap" || item.mistakeCause === "time_pressure" || item.mistakeCause === "choice_trap" || item.mistakeCause === "careless" || item.mistakeCause === "unknown"
        ? item.mistakeCause
        : undefined,
      result,
      };
    });
}

function canonicalizeQuestionMistakeAnalysis(
  answerKey: SheetAnswerItem[],
  questionMeta: NonNullable<WrongAnswerEntry["questionMeta"]>,
) {
  const nextMeta = [...questionMeta];
  const nextAnswers = answerKey.map((answer) => {
    const next = { ...answer };
    delete next.mistakeAnalysis;
    delete next.needsReview;
    return next;
  });

  for (const answer of answerKey) {
    if (!answer.mistakeAnalysis?.causes.length && !answer.needsReview) continue;
    const number = normalizeQuestionNumber(answer.questionNumber);
    const index = nextMeta.findIndex(
      (meta) => normalizeQuestionNumber(meta.questionNumber) === number,
    );
    if (index >= 0) {
      nextMeta[index] = {
        ...nextMeta[index],
        mistakeAnalysis: nextMeta[index].mistakeAnalysis?.causes.length
          ? nextMeta[index].mistakeAnalysis
          : answer.mistakeAnalysis,
        needsReview: nextMeta[index].needsReview || Boolean(answer.needsReview),
      };
    } else {
      nextMeta.push({
        questionNumber: number,
        important: false,
        mistakeAnalysis: answer.mistakeAnalysis?.causes.length ? answer.mistakeAnalysis : undefined,
        needsReview: Boolean(answer.needsReview),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return { answerKey: nextAnswers, questionMeta: nextMeta };
}

export function normalizeEntry(raw: WrongAnswerEntry): WrongAnswerEntry {
  const {
    explanation: _legacyExp,
    explanationImages: _legacyExpImg,
    images: _legacyImg,
    ...rest
  } = raw;
  void _legacyExp;
  void _legacyExpImg;
  void _legacyImg;

  const legacy = _legacyImg ?? [];
  let title = rest.title?.trim() ?? "";
  let question = rest.question ?? "";

  if (!title && question.trim()) {
    const lines = question.trim().split("\n");
    title = lines[0].slice(0, 120);
    if (lines.length > 1) {
      question = lines.slice(1).join("\n").trim();
    }
  }

  let explanationParts: ExplanationPart[] = Array.isArray(rest.explanationParts)
    ? rest.explanationParts.map((p) => ({
        id: p.id || uuidv4(),
        text: p.text ?? "",
        images: [...(p.images ?? [])],
      }))
    : [];

  const legacyText = _legacyExp?.trim() ?? "";
  const legacyImgs = _legacyExpImg?.length ? [..._legacyExpImg] : [];

  if (!explanationParts.length && (legacyText || legacyImgs.length)) {
    explanationParts = [
      {
        id: "migrated-legacy",
        text: legacyText,
        images: legacyImgs,
      },
    ];
  }

  const entryKind: EntryKind = isEntryKind(rest.entryKind)
    ? rest.entryKind
    : "wrong_answer";

  // Migrate or normalize difficulty
  const rawDifficulty: unknown = rest.difficulty;
  let difficulty: Difficulty = "none";
  if (isDifficulty(rawDifficulty)) {
    difficulty = rawDifficulty;
  } else if (rest.difficult) {
    difficulty = "high";
  }

  const answerKey = normalizeAnswerKey(rest.answerKey);
  const difficultyScore =
    normalizeDifficultyScore(rest.difficultyScore) ??
    (entryKind === "problem_sheet" ? maxAnswerDifficultyScore(answerKey) : undefined);
  const figures = normalizeFigures(rest.figures);
  const structuredQuestions = scrubRejectedNotesFromStructuredQuestions(
    normalizeStructuredQuestions(rest.structuredQuestions),
    normalizeRejectedNotes(rest.rejectedNotes),
  );
  const learningBlocks = normalizeLearningBlocks(rest.learningBlocks);
  const canonical = canonicalizeQuestionMistakeAnalysis(
    answerKey,
    normalizeQuestionMeta(rest.questionMeta),
  );
  const review = normalizeReview(rest.review, Boolean(rest.mastered));

  return {
    ...rest,
    folderId: typeof rest.folderId === "string" && rest.folderId.trim()
      ? rest.folderId.trim()
      : undefined,
    generatedFromExamSessionId:
      typeof rest.generatedFromExamSessionId === "string" && rest.generatedFromExamSessionId.trim()
        ? rest.generatedFromExamSessionId.trim()
        : undefined,
    generatedFromQuestionNumber: (() => {
      if (typeof rest.generatedFromQuestionNumber !== "string") return undefined;
      const normalized = normalizeQuestionNumber(rest.generatedFromQuestionNumber);
      return normalized || undefined;
    })(),
    title,
    question,
    entryKind,
    difficult: Boolean(rest.difficult),
    difficulty,
    difficultyScore,
    questionImages: rest.questionImages?.length
      ? rest.questionImages
      : legacy,
    sourcePageImages: Array.isArray(rest.sourcePageImages)
      ? rest.sourcePageImages.filter((image): image is string => typeof image === "string" && image.trim().length > 0).map((image) => image.trim())
      : [],
    problemSource: normalizeProblemSource(rest.problemSource),
    explanationParts,
    memo: rest.memo ?? "",
    annotations: rest.annotations ?? [],
    tags: Array.isArray(rest.tags) ? rest.tags : [],
    answerKey: canonical.answerKey,
    figures,
    questionMeta: canonical.questionMeta,
    structuredQuestions,
    questionContentSegments: normalizeQuestionContentSegments(rest.questionContentSegments),
    sheetGroup: entryKind === "problem_sheet" ? normalizeSheetGroup(rest.sheetGroup) : undefined,
    learningBlocks,
    importAudit: rest.importAudit
      ? normalizeImportAudit(rest.importAudit, { question, answerKey, figures, structuredQuestions })
      : undefined,
    rejectedNotes: normalizeRejectedNotes(rest.rejectedNotes),
    mistakeAnalysis: normalizeMistakeAnalysis(rest.mistakeAnalysis),
    review,
    checklist: entryKind === "concept" || entryKind === "lecture" ? normalizeChecklist(rest.checklist) : rest.checklist ?? [],
    sourceType: isLectureSourceType(rest.sourceType) ? rest.sourceType : undefined,
    linkedEntryIds: Array.isArray(rest.linkedEntryIds)
      ? rest.linkedEntryIds.map((id) => `${id}`.trim()).filter(Boolean)
      : [],
    supplementalResources: normalizeSupplementalResources(rest.supplementalResources),
    similarQuestionLinks: normalizeSimilarQuestionLinks(rest.similarQuestionLinks),
    concepts: normalizeImportantPoints(rest.concepts),
    reviewAttempts: normalizeReviewAttempts(rest.reviewAttempts, rest.id),
    mastered: review?.phase === "archived",
  };
}

export function getEntryTitle(entry: WrongAnswerEntry): string {
  const t = entry.title.trim();
  if (t) return t;
  if (entry.questionImages.length > 0) return "(이미지 문제)";
  if (entry.question.trim()) return entry.question.trim().slice(0, 40);
  return "(제목 없음)";
}

export function getAllImageFilenames(entry: WrongAnswerEntry): string[] {
  const fromParts = entry.explanationParts.flatMap((p) => p.images);
  const fromLearningBlocks = (entry.learningBlocks ?? []).flatMap((block) => block.images ?? []);
  const fromSupplementalResources = (entry.supplementalResources ?? []).flatMap((resource) => resource.images ?? []);
  const fromFigures = (entry.figures ?? []).flatMap((figure) => [figure.image, figure.original?.image, figure.original?.sourcePageImage, figure.cleaned?.image].filter((image): image is string => Boolean(image)));
  return [
    ...new Set([
      ...entry.questionImages,
      ...(entry.sourcePageImages ?? []),
      ...fromParts,
      ...fromFigures,
      ...fromLearningBlocks,
      ...fromSupplementalResources,
      ...(entry.images ?? []),
    ]),
  ];
}

export function hasEntryContent(
  entry: Pick<WrongAnswerEntry, "title" | "question" | "questionImages"> &
    Partial<Pick<WrongAnswerEntry, "learningBlocks">>,
): boolean {
  return (
    Boolean(entry.title.trim()) ||
    Boolean(entry.question.trim()) ||
    entry.questionImages.length > 0 ||
    Boolean(entry.learningBlocks?.some((block) => block.title.trim() || block.content.trim() || block.diagramSpec))
  );
}

export function explanationPartHasContent(part: ExplanationPart): boolean {
  return Boolean(part.text.trim()) || part.images.length > 0;
}

export function hasExplanationContent(entry: WrongAnswerEntry): boolean {
  return entry.explanationParts.some(explanationPartHasContent);
}

export function collectExplanationSearchText(entry: WrongAnswerEntry): string {
  return entry.explanationParts.map((p) => p.text).join(" ");
}
