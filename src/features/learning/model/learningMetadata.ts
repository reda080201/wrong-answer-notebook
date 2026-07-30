import type {
  LearningChoiceExample,
  LearningImportance,
  LearningPassageExample,
  LearningReviewStatus,
  LearningSourceReference,
  LearningSubjectDomain,
  SubjectLearningMetadata,
} from "../../../types";

const DOMAIN_ALIASES: Array<[LearningSubjectDomain, RegExp]> = [
  ["math", /^(수학|공통수학|수학[ⅠⅡ]|미적분|확률과 통계|확통|기하)$/i],
  ["language_media", /^(언어와 매체|언매)$/i],
  ["social_culture", /^(사회[·ㆍ ]?문화|사문)$/i],
  ["life_ethics", /^(생활과 윤리|생윤)$/i],
];

export function inferLearningSubjectDomain(subject: string | undefined): LearningSubjectDomain {
  const normalized = subject?.trim() ?? "";
  return DOMAIN_ALIASES.find(([, matcher]) => matcher.test(normalized))?.[0] ?? "general";
}

export function isLearningSubjectDomain(value: unknown): value is LearningSubjectDomain {
  return value === "math" || value === "language_media" || value === "social_culture" || value === "life_ethics" || value === "general";
}

export function isLearningImportance(value: unknown): value is LearningImportance {
  return value === "essential" || value === "recommended" || value === "reference";
}

export function isLearningReviewStatus(value: unknown): value is LearningReviewStatus {
  return value === "draft" || value === "needs_review" || value === "reviewed";
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

export function normalizeLearningSourceReferences(value: unknown): LearningSourceReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      entryId: typeof item.entryId === "string" ? item.entryId.trim() : "",
      entryTitle: typeof item.entryTitle === "string" ? item.entryTitle.trim() || undefined : undefined,
      questionNumber: typeof item.questionNumber === "string" ? item.questionNumber.trim() || undefined : undefined,
      sourceType: item.sourceType === "problem" || item.sourceType === "answer" || item.sourceType === "solution" || item.sourceType === "lecture" || item.sourceType === "concept" || item.sourceType === "manual" ? item.sourceType : undefined,
    }))
    .filter((item) => Boolean(item.entryId));
}

export function normalizePassageExamples(value: unknown): LearningPassageExample[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `passage-${index + 1}`,
      text: typeof item.text === "string" ? item.text.trim() : "",
      explanation: typeof item.explanation === "string" ? item.explanation.trim() || undefined : undefined,
      clues: strings(item.clues),
      isSynthetic: item.isSynthetic === true,
    }))
    .filter((item) => Boolean(item.text));
}

export function normalizeChoiceExamples(value: unknown): LearningChoiceExample[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `choice-${index + 1}`,
      text: typeof item.text === "string" ? item.text.trim() : "",
      verdict: item.verdict === "correct" || item.verdict === "incorrect" || item.verdict === "depends" ? item.verdict : undefined,
      reason: typeof item.reason === "string" ? item.reason.trim() || undefined : undefined,
      isSynthetic: item.isSynthetic === true,
    }))
    .filter((item) => Boolean(item.text));
}

export function normalizeSubjectLearningMetadata(value: unknown): SubjectLearningMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (item.subject === "math") {
    const knowledgeType = item.knowledgeType;
    if (knowledgeType !== "formula" && knowledgeType !== "concept" && knowledgeType !== "solution_method" && knowledgeType !== "problem_signal" && knowledgeType !== "condition_check" && knowledgeType !== "transformation" && knowledgeType !== "common_trap") return undefined;
    return { subject: "math", knowledgeType, formulaLatex: strings(item.formulaLatex), prerequisites: strings(item.prerequisites), problemSignals: strings(item.problemSignals), whenToUse: strings(item.whenToUse), avoidWhen: strings(item.avoidWhen), solutionSteps: strings(item.solutionSteps), exampleOutline: typeof item.exampleOutline === "string" ? item.exampleOutline.trim() || undefined : undefined };
  }
  if (item.subject === "language_media") {
    const knowledgeType = item.knowledgeType;
    if (knowledgeType !== "concept" && knowledgeType !== "rule" && knowledgeType !== "exception" && knowledgeType !== "example" && knowledgeType !== "analysis_method" && knowledgeType !== "choice_pattern") return undefined;
    return { subject: "language_media", knowledgeType, area: item.area === "language" || item.area === "media" ? item.area : undefined, rule: typeof item.rule === "string" ? item.rule.trim() || undefined : undefined, exceptions: strings(item.exceptions), identificationClues: strings(item.identificationClues), commonWrongClaims: strings(item.commonWrongClaims) };
  }
  if (item.subject === "social_culture") {
    const knowledgeType = item.knowledgeType;
    if (knowledgeType !== "concept" && knowledgeType !== "comparison" && knowledgeType !== "passage_pattern" && knowledgeType !== "choice_pattern" && knowledgeType !== "research_method" && knowledgeType !== "data_analysis" && knowledgeType !== "common_confusion") return undefined;
    return { subject: "social_culture", knowledgeType, definition: typeof item.definition === "string" ? item.definition.trim() || undefined : undefined, judgementCriteria: strings(item.judgementCriteria), passageClues: strings(item.passageClues), casePatterns: strings(item.casePatterns), comparisonTargets: strings(item.comparisonTargets), commonConfusions: strings(item.commonConfusions), dataTypes: Array.isArray(item.dataTypes) ? item.dataTypes.filter((dataType): dataType is "table" | "graph" | "research_case" | "passage" | "statistics" => dataType === "table" || dataType === "graph" || dataType === "research_case" || dataType === "passage" || dataType === "statistics") : undefined };
  }
  if (item.subject === "life_ethics") {
    const knowledgeType = item.knowledgeType;
    if (knowledgeType !== "concept" && knowledgeType !== "thinker" && knowledgeType !== "ethical_issue" && knowledgeType !== "claim" && knowledgeType !== "comparison" && knowledgeType !== "passage_pattern" && knowledgeType !== "choice_pattern" && knowledgeType !== "common_confusion") return undefined;
    return { subject: "life_ethics", knowledgeType, thinkers: strings(item.thinkers), thinkerAliases: strings(item.thinkerAliases), ethicalIssues: strings(item.ethicalIssues), keyClaims: strings(item.keyClaims), affirmedClaims: strings(item.affirmedClaims), rejectedClaims: strings(item.rejectedClaims), passageClues: strings(item.passageClues), comparisonThinkers: strings(item.comparisonThinkers), commonConfusions: strings(item.commonConfusions) };
  }
  return undefined;
}
