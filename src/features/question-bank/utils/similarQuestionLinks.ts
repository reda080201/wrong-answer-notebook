import { v4 as uuidv4 } from "uuid";
import type { LearningBlock, SimilarQuestionLink, SubjectLearningMetadata, WrongAnswerEntry } from "../../../types";
import type { QuestionBankItem } from "../model/questionBankTypes";
import { normalizeQuestionMeta, normalizeQuestionNumber } from "../../../utils/questionMeta";

export interface SimilarQuestionContext {
  sourceId: string;
  sourceQuestionNumber?: string;
  subject?: string;
  unit?: string;
  subunit?: string;
  difficultyScore?: number;
  concepts: string[];
  tags: string[];
  keywords: string[];
  entryTitle?: string;
  entryKind?: WrongAnswerEntry["entryKind"];
  sourceType?: string;
  formulae?: string[];
  solutionMethods?: string[];
  passageClues?: string[];
  thinkers?: string[];
  choiceCriteria?: string[];
}

export interface SimilarQuestionCandidatePayload {
  candidateId: string;
  questionText: string;
  subject: string;
  unit?: string;
  subunit?: string;
  concepts?: string[];
  difficultyScore?: number;
  importanceScore?: number;
  qualityScore?: number;
  hasExplanation: boolean;
  explanation?: string;
}

export interface SimilarQuestionRankingRequest {
  context: SimilarQuestionContext;
  candidates: SimilarQuestionCandidatePayload[];
}

export interface LocalSimilarQuestion {
  candidate: QuestionBankItem;
  score: number;
  reasons: string[];
  sharedConcepts: string[];
  differences: string[];
}

const clamp = (value: unknown) => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const key = (entryId: string, questionNumber: string) => `${entryId}:${normalizeQuestionNumber(questionNumber)}`;

function metadataValues(metadata: SubjectLearningMetadata | undefined) {
  if (!metadata) return { formulae: [] as string[], solutionMethods: [] as string[], passageClues: [] as string[], thinkers: [] as string[], choiceCriteria: [] as string[] };
  if (metadata.subject === "math") return { formulae: metadata.formulaLatex ?? [], solutionMethods: [...(metadata.solutionSteps ?? []), ...(metadata.whenToUse ?? [])], passageClues: [], thinkers: [], choiceCriteria: [] };
  if (metadata.subject === "language_media") return { formulae: [], solutionMethods: metadata.identificationClues ?? [], passageClues: [], thinkers: [], choiceCriteria: metadata.commonWrongClaims ?? [] };
  if (metadata.subject === "social_culture") return { formulae: [], solutionMethods: metadata.judgementCriteria ?? [], passageClues: metadata.passageClues ?? [], thinkers: [], choiceCriteria: metadata.commonConfusions ?? [] };
  return { formulae: [], solutionMethods: metadata.keyClaims ?? [], passageClues: metadata.passageClues ?? [], thinkers: [...(metadata.thinkers ?? []), ...(metadata.comparisonThinkers ?? [])], choiceCriteria: [...(metadata.affirmedClaims ?? []), ...(metadata.rejectedClaims ?? [])] };
}

export function buildSimilarQuestionContext(entry: WrongAnswerEntry, block?: LearningBlock): SimilarQuestionContext {
  const metadata = block?.subjectMetadata && typeof block.subjectMetadata === "object" ? block.subjectMetadata : undefined;
  const subjectValues = metadataValues(metadata);
  const linkedQuestionMeta = block?.sourceQuestionNumber
    ? normalizeQuestionMeta(entry.questionMeta).find((meta) => normalizeQuestionNumber(meta.questionNumber) === normalizeQuestionNumber(block.sourceQuestionNumber ?? ""))
    : undefined;
  return {
    sourceId: entry.id,
    sourceQuestionNumber: block?.sourceQuestionNumber,
    subject: entry.subject,
    unit: block?.unit,
    subunit: block?.subunit,
    difficultyScore: linkedQuestionMeta?.difficultyScore,
    concepts: unique([...(block?.relatedConcepts ?? []), ...(block?.keywords ?? []), ...Object.values(metadata ?? {}).flatMap((value) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" ? [value] : [])]),
    tags: unique(entry.tags ?? []),
    keywords: unique(block?.keywords ?? []),
    entryTitle: entry.title,
    entryKind: entry.entryKind,
    sourceType: entry.problemSource?.type,
    formulae: unique(subjectValues.formulae),
    solutionMethods: unique(subjectValues.solutionMethods),
    passageClues: unique(subjectValues.passageClues),
    thinkers: unique(subjectValues.thinkers),
    choiceCriteria: unique(subjectValues.choiceCriteria),
  };
}

export function toSimilarQuestionCandidatePayload(candidate: QuestionBankItem): SimilarQuestionCandidatePayload {
  return {
    candidateId: candidate.id,
    questionText: candidate.questionText,
    subject: candidate.subject,
    unit: candidate.classification.unit,
    subunit: candidate.classification.subunit,
    concepts: candidate.classification.concepts,
    difficultyScore: candidate.classification.difficultyScore,
    importanceScore: candidate.classification.importanceScore,
    qualityScore: candidate.classification.qualityScore,
    hasExplanation: candidate.hasExplanation,
    explanation: candidate.explanation,
  };
}

export function rankLocalSimilarQuestions(context: SimilarQuestionContext, items: QuestionBankItem[], links: SimilarQuestionLink[] = [], limit = 30): LocalSimilarQuestion[] {
  const excluded = new Set(links.filter((link) => link.status === "approved" || link.status === "rejected").map((link) => key(link.targetEntryId, link.targetQuestionNumber)));
  return items.flatMap((candidate) => {
    const isSourceQuestion = candidate.entryId === context.sourceId &&
      (!context.sourceQuestionNumber || key(candidate.entryId, candidate.questionNumber) === key(context.sourceId, context.sourceQuestionNumber));
    if (candidate.subject !== context.subject || isSourceQuestion || excluded.has(key(candidate.entryId, candidate.questionNumber))) return [];
    const sharedConcepts = (candidate.classification.concepts ?? []).filter((concept) => context.concepts.includes(concept));
    const sharedTags = (candidate.classification.tags ?? []).filter((tag) => context.tags.includes(tag));
    const sameUnit = Boolean(candidate.classification.unit && candidate.classification.unit === context.unit);
    const sameSubunit = Boolean(candidate.classification.subunit && candidate.classification.subunit === context.subunit);
    if (!sameUnit && !sameSubunit && sharedConcepts.length === 0 && sharedTags.length < 2) return [];
    const reasons: string[] = [];
    let score = 0;
    if (sameUnit) { score += 25; reasons.push("같은 단원"); }
    if (sameSubunit) { score += 20; reasons.push("같은 소단원"); }
    score += sharedConcepts.length * 15;
    if (sharedConcepts.length) reasons.push(`공통 개념 ${sharedConcepts.length}개`);
    score += sharedTags.length * 5;
    if (sharedTags.length) reasons.push(`공통 태그 ${sharedTags.length}개`);
    if (context.difficultyScore !== undefined && candidate.classification.difficultyScore !== undefined && Math.abs(context.difficultyScore - candidate.classification.difficultyScore) <= 10) {
      score += 10;
      reasons.push("비슷한 난이도");
    }
    if (candidate.hasExplanation) { score += 5; reasons.push("해설 있음"); }
    return [{ candidate, score: clamp(score), reasons, sharedConcepts, differences: [] }];
  }).sort((left, right) => right.score - left.score || (right.candidate.classification.qualityScore ?? 0) - (left.candidate.classification.qualityScore ?? 0) || left.candidate.id.localeCompare(right.candidate.id)).slice(0, limit);
}

export function parseGeminiSimilarQuestionRanking(raw: unknown, allowedCandidateIds: Set<string>): Array<Pick<SimilarQuestionLink, "targetEntryId" | "targetQuestionNumber" | "score" | "reasons" | "sharedConcepts" | "differences"> & { candidateId: string }> {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw) as unknown; } catch { return null; } })() : raw;
  const results = value && typeof value === "object" && Array.isArray((value as { results?: unknown }).results) ? (value as { results: unknown[] }).results : [];
  const seen = new Set<string>();
  return results.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.candidateId !== "string" || !allowedCandidateIds.has(row.candidateId) || seen.has(row.candidateId)) return [];
    seen.add(row.candidateId);
    const [targetEntryId, targetQuestionNumber = ""] = row.candidateId.split(":");
    if (!targetEntryId || !targetQuestionNumber) return [];
    const strings = (value: unknown) => Array.isArray(value) ? unique(value.filter((item): item is string => typeof item === "string")) : [];
    return [{ candidateId: row.candidateId, targetEntryId, targetQuestionNumber: normalizeQuestionNumber(targetQuestionNumber), score: clamp(row.score), reasons: strings(row.reasons), sharedConcepts: strings(row.sharedConcepts), differences: strings(row.differences) }];
  });
}

export function resolveSimilarQuestionLinks(links: SimilarQuestionLink[] = [], items: QuestionBankItem[]) {
  const byKey = new Map(items.map((item) => [key(item.entryId, item.questionNumber), item]));
  return links.map((link) => ({ link, item: byKey.get(key(link.targetEntryId, link.targetQuestionNumber)) ?? null }));
}

export function approveSimilarQuestionLinks(links: SimilarQuestionLink[], now = new Date().toISOString()) {
  return links.map((link) => ({ ...link, status: "approved" as const, updatedAt: now }));
}

export function rejectSimilarQuestionLinks(links: SimilarQuestionLink[], now = new Date().toISOString()) {
  return links.map((link) => ({ ...link, status: "rejected" as const, updatedAt: now }));
}

export function createSimilarQuestionLink(candidate: LocalSimilarQuestion, source: "local" | "manual" | "gemini" = "local", now = new Date().toISOString()): SimilarQuestionLink {
  return { id: uuidv4(), targetEntryId: candidate.candidate.entryId, targetQuestionNumber: normalizeQuestionNumber(candidate.candidate.questionNumber), score: candidate.score, reasons: candidate.reasons, sharedConcepts: candidate.sharedConcepts, differences: candidate.differences, source, status: "suggested", createdAt: now, updatedAt: now };
}
