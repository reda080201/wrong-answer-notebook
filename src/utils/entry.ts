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
  MistakeCauseType,
  ReviewEvent,
  ReviewAttempt,
  ReviewResult,
  ReviewState,
  QuestionContentSegment,
  SheetFigureItem,
  SheetAnswerItem,
  WrongAnswerEntry,
} from "../types";
import { isReviewStrategy, normalizeMistakeAnalysis } from "./mistakeAnalysis";
import { normalizeImportAudit, normalizeRejectedNotes } from "./importAudit";
import { normalizeQuestionMeta, normalizeQuestionNumber } from "./questionMeta";
import { maxAnswerDifficultyScore, normalizeDifficultyScore } from "./difficulty";
import { normalizeSheetGroup } from "./sheetGroup";

function isEntryKind(v: unknown): v is EntryKind {
  return v === "wrong_answer" || v === "problem_sheet" || v === "concept" || v === "lecture";
}

function isLectureSourceType(v: unknown): v is LectureSourceType {
  return v === "html" || v === "md" || v === "txt" || v === "json";
}

function isDifficulty(v: unknown): v is Difficulty {
  return v === "high" || v === "medium" || v === "low" || v === "none";
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

function isReviewResult(v: unknown): v is ReviewResult {
  return v === "again" || v === "hard" || v === "good";
}

function isValidIsoDate(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(new Date(v).getTime());
}

function normalizeReview(raw: unknown, mastered = false): ReviewState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<ReviewState>;
  const historySource = Array.isArray(value.history) ? value.history : [];
  const history: ReviewEvent[] = historySource
    .filter((event) => Boolean(event && typeof event === "object"))
    .map((event) => event as Partial<ReviewEvent>)
    .map((event) => {
      const reviewedAt = isValidIsoDate(event.reviewedAt)
        ? event.reviewedAt
        : new Date().toISOString();
      const nextDueAt =
        event.nextDueAt === null || isValidIsoDate(event.nextDueAt)
          ? event.nextDueAt
          : null;
      return {
        id: event.id || uuidv4(),
        reviewedAt,
        result: isReviewResult(event.result) ? event.result : "again",
        nextDueAt,
        intervalDays:
          typeof event.intervalDays === "number" && event.intervalDays >= 0
            ? event.intervalDays
            : 1,
        causeSnapshot: Array.isArray(event.causeSnapshot)
          ? event.causeSnapshot.filter((item): item is MistakeCauseType =>
              item === "calculation" ||
              item === "condition_misread" ||
              item === "concept_gap" ||
              item === "strategy_gap" ||
              item === "time_pressure" ||
              item === "choice_trap" ||
              item === "careless" ||
              item === "unknown",
            )
          : undefined,
        strategy: isReviewStrategy(event.strategy) ? event.strategy : undefined,
        stabilityDays:
          typeof event.stabilityDays === "number" && event.stabilityDays > 0
            ? event.stabilityDays
            : undefined,
        memoryDifficulty:
          typeof event.memoryDifficulty === "number" && event.memoryDifficulty >= 1
            ? Math.min(10, event.memoryDifficulty)
            : undefined,
        lapseCount:
          typeof event.lapseCount === "number" && event.lapseCount >= 0
            ? Math.floor(event.lapseCount)
            : undefined,
      };
    });

  return {
    dueAt: value.dueAt === null || isValidIsoDate(value.dueAt) ? value.dueAt : null,
    lastReviewedAt: isValidIsoDate(value.lastReviewedAt)
      ? value.lastReviewedAt
      : undefined,
    intervalDays:
      typeof value.intervalDays === "number" && value.intervalDays >= 0
        ? value.intervalDays
        : 0,
    streak:
      typeof value.streak === "number" && value.streak >= 0
        ? Math.floor(value.streak)
        : 0,
    history,
    stabilityDays:
      typeof value.stabilityDays === "number" && value.stabilityDays > 0
        ? value.stabilityDays
        : Math.max(0.5, typeof value.intervalDays === "number" ? value.intervalDays : 0),
    memoryDifficulty:
      typeof value.memoryDifficulty === "number" && value.memoryDifficulty >= 1
        ? Math.min(10, value.memoryDifficulty)
        : 5,
    lapseCount:
      typeof value.lapseCount === "number" && value.lapseCount >= 0
        ? Math.floor(value.lapseCount)
        : history.filter((event) => event.result === "again").length,
    preLapseStabilityDays:
      typeof value.preLapseStabilityDays === "number" && value.preLapseStabilityDays > 0
        ? value.preLapseStabilityDays
        : undefined,
    relearningStep:
      value.relearningStep === 0 || value.relearningStep === 1
        ? value.relearningStep
        : undefined,
    repetitionCount:
      typeof value.repetitionCount === "number" && value.repetitionCount >= 0
        ? Math.floor(value.repetitionCount)
        : history.length,
    phase:
      value.phase === "learning" || value.phase === "relearning" || value.phase === "long_term" || value.phase === "archived"
        ? value.phase
        : mastered
          ? value.dueAt
            ? "long_term"
            : "archived"
          : "learning",
  };
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
      };
    })
    .filter((item) => item.title || item.content || item.diagramType || item.diagramSpec);
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
      placement: normalizeFigurePlacement(item.placement),
    }))
    .filter((item) => item.questionNumber || item.title || item.caption || item.image);
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
  const learningBlocks = normalizeLearningBlocks(rest.learningBlocks);
  const canonical = canonicalizeQuestionMistakeAnalysis(
    answerKey,
    normalizeQuestionMeta(rest.questionMeta),
  );
  const review = normalizeReview(rest.review, Boolean(rest.mastered));

  return {
    ...rest,
    title,
    question,
    entryKind,
    difficult: Boolean(rest.difficult),
    difficulty,
    difficultyScore,
    questionImages: rest.questionImages?.length
      ? rest.questionImages
      : legacy,
    explanationParts,
    memo: rest.memo ?? "",
    annotations: rest.annotations ?? [],
    tags: Array.isArray(rest.tags) ? rest.tags : [],
    answerKey: canonical.answerKey,
    figures,
    questionMeta: canonical.questionMeta,
    questionContentSegments: normalizeQuestionContentSegments(rest.questionContentSegments),
    sheetGroup: entryKind === "problem_sheet" ? normalizeSheetGroup(rest.sheetGroup) : undefined,
    learningBlocks,
    importAudit: rest.importAudit
      ? normalizeImportAudit(rest.importAudit, { question, answerKey, figures })
      : undefined,
    rejectedNotes: normalizeRejectedNotes(rest.rejectedNotes),
    mistakeAnalysis: normalizeMistakeAnalysis(rest.mistakeAnalysis),
    review,
    checklist: entryKind === "concept" || entryKind === "lecture" ? normalizeChecklist(rest.checklist) : rest.checklist ?? [],
    sourceType: isLectureSourceType(rest.sourceType) ? rest.sourceType : undefined,
    linkedEntryIds: Array.isArray(rest.linkedEntryIds)
      ? rest.linkedEntryIds.map((id) => `${id}`.trim()).filter(Boolean)
      : [],
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
  const fromFigures = (entry.figures ?? []).flatMap((figure) => (figure.image ? [figure.image] : []));
  return [
    ...new Set([
      ...entry.questionImages,
      ...fromParts,
      ...fromFigures,
      ...(entry.images ?? []),
    ]),
  ];
}

export function hasEntryContent(
  entry: Pick<WrongAnswerEntry, "title" | "question" | "questionImages">,
): boolean {
  return (
    Boolean(entry.title.trim()) ||
    Boolean(entry.question.trim()) ||
    entry.questionImages.length > 0
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
