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
  content?: string;
  units?: string[];
  subunits?: string[];
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

export interface SimilarQuestionRankingResponse {
  content: string;
  model: string;
  promptVersion: "similar-question-ranking-v1";
}

export interface PreparedSimilarQuestionRankingRequest {
  request: SimilarQuestionRankingRequest;
  truncated: boolean;
  blocked: boolean;
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
export const MAX_SIMILAR_QUESTION_CANDIDATES = 30;
export const MAX_SIMILAR_CONTEXT_CONTENT_BYTES = 6_000;
export const MAX_SIMILAR_CANDIDATE_QUESTION_BYTES = 3_000;
export const MAX_SIMILAR_CANDIDATE_EXPLANATION_BYTES = 1_500;
export const MAX_SIMILAR_RANKING_REQUEST_BYTES = 96 * 1024;

const encoder = new TextEncoder();
const byteLength = (value: string) => encoder.encode(value).byteLength;

function truncateUtf8(value: string, maxBytes: number) {
  if (byteLength(value) <= maxBytes) return value;
  let start = 0;
  let end = value.length;
  while (start < end) {
    const middle = Math.ceil((start + end) / 2);
    if (byteLength(value.slice(0, middle)) <= maxBytes) start = middle;
    else end = middle - 1;
  }
  // Avoid returning a dangling UTF-16 surrogate when the byte limit cuts an emoji.
  const safeEnd = start > 0 && /[\uD800-\uDBFF]/.test(value[start - 1]) ? start - 1 : start;
  return value.slice(0, safeEnd).trimEnd();
}

function metadataValues(metadata: SubjectLearningMetadata | undefined) {
  if (!metadata) return { formulae: [] as string[], solutionMethods: [] as string[], passageClues: [] as string[], thinkers: [] as string[], choiceCriteria: [] as string[] };
  if (metadata.subject === "math") return { formulae: metadata.formulaLatex ?? [], solutionMethods: [...(metadata.solutionSteps ?? []), ...(metadata.whenToUse ?? [])], passageClues: [], thinkers: [], choiceCriteria: [] };
  if (metadata.subject === "language_media") return { formulae: [], solutionMethods: metadata.identificationClues ?? [], passageClues: [], thinkers: [], choiceCriteria: metadata.commonWrongClaims ?? [] };
  if (metadata.subject === "social_culture") return { formulae: [], solutionMethods: metadata.judgementCriteria ?? [], passageClues: metadata.passageClues ?? [], thinkers: [], choiceCriteria: metadata.commonConfusions ?? [] };
  return { formulae: [], solutionMethods: metadata.keyClaims ?? [], passageClues: metadata.passageClues ?? [], thinkers: [...(metadata.thinkers ?? []), ...(metadata.comparisonThinkers ?? [])], choiceCriteria: [...(metadata.affirmedClaims ?? []), ...(metadata.rejectedClaims ?? [])] };
}

export function buildSimilarQuestionContext(entry: WrongAnswerEntry, block?: LearningBlock): SimilarQuestionContext {
  const blocks = block ? [block] : entry.learningBlocks ?? [];
  const metadata = block?.subjectMetadata && typeof block.subjectMetadata === "object" ? block.subjectMetadata : undefined;
  const subjectValues = metadataValues(metadata);
  const allSubjectValues = blocks.map((candidate) => metadataValues(candidate.subjectMetadata));
  const linkedQuestionMeta = block?.sourceQuestionNumber
    ? normalizeQuestionMeta(entry.questionMeta).find((meta) => normalizeQuestionNumber(meta.questionNumber) === normalizeQuestionNumber(block.sourceQuestionNumber ?? ""))
    : undefined;
  const scores = normalizeQuestionMeta(entry.questionMeta)
    .map((meta) => meta.difficultyScore)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score))
    .sort((left, right) => left - right);
  const aggregateDifficulty = scores.length ? scores[Math.floor(scores.length / 2)] : undefined;
  const aggregateMetadataStrings = blocks.flatMap((candidate) => Object.values(candidate.subjectMetadata ?? {}).flatMap((value) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" ? [value] : []));
  const content = block
    ? [block.title, block.content].filter(Boolean).join("\n")
    : [entry.title, entry.question, entry.memo, ...blocks.flatMap((candidate) => [candidate.title, candidate.content])].filter(Boolean).join("\n");
  return {
    sourceId: entry.id,
    sourceQuestionNumber: block?.sourceQuestionNumber,
    subject: entry.subject,
    unit: block?.unit,
    subunit: block?.subunit,
    units: unique(block ? [block.unit ?? ""] : blocks.map((candidate) => candidate.unit ?? "")),
    subunits: unique(block ? [block.subunit ?? ""] : blocks.map((candidate) => candidate.subunit ?? "")),
    difficultyScore: linkedQuestionMeta?.difficultyScore ?? aggregateDifficulty,
    concepts: unique([entry.title, ...(entry.concepts ?? []), ...blocks.flatMap((candidate) => [...(candidate.relatedConcepts ?? []), ...(candidate.keywords ?? [])]), ...aggregateMetadataStrings]),
    tags: unique(entry.tags ?? []),
    keywords: unique(block ? block.keywords ?? [] : blocks.flatMap((candidate) => candidate.keywords ?? [])),
    entryTitle: entry.title,
    entryKind: entry.entryKind,
    sourceType: entry.problemSource?.type,
    formulae: unique(block ? subjectValues.formulae : allSubjectValues.flatMap((value) => value.formulae)),
    solutionMethods: unique(block ? subjectValues.solutionMethods : allSubjectValues.flatMap((value) => value.solutionMethods)),
    passageClues: unique(block ? subjectValues.passageClues : allSubjectValues.flatMap((value) => value.passageClues)),
    thinkers: unique(block ? subjectValues.thinkers : allSubjectValues.flatMap((value) => value.thinkers)),
    choiceCriteria: unique(block ? subjectValues.choiceCriteria : allSubjectValues.flatMap((value) => value.choiceCriteria)),
    content,
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

export function prepareSimilarQuestionRankingRequest(context: SimilarQuestionContext, candidates: SimilarQuestionCandidatePayload[]): PreparedSimilarQuestionRankingRequest {
  let truncated = false;
  const trim = (value: string | undefined, maxBytes: number) => {
    const next = truncateUtf8(value ?? "", maxBytes);
    truncated ||= next !== (value ?? "");
    return next;
  };
  const request: SimilarQuestionRankingRequest = {
    context: { ...context, content: trim(context.content, MAX_SIMILAR_CONTEXT_CONTENT_BYTES) },
    candidates: candidates.slice(0, MAX_SIMILAR_QUESTION_CANDIDATES).map((candidate) => ({
      ...candidate,
      questionText: trim(candidate.questionText, MAX_SIMILAR_CANDIDATE_QUESTION_BYTES),
      explanation: candidate.explanation ? trim(candidate.explanation, MAX_SIMILAR_CANDIDATE_EXPLANATION_BYTES) : undefined,
    })),
  };
  truncated ||= candidates.length > request.candidates.length;
  const size = () => byteLength(JSON.stringify(request));
  for (let index = request.candidates.length - 1; size() > MAX_SIMILAR_RANKING_REQUEST_BYTES && index >= 0; index -= 1) {
    if (request.candidates[index].explanation) {
      request.candidates[index] = { ...request.candidates[index], explanation: undefined };
      truncated = true;
    }
  }
  for (let index = request.candidates.length - 1; size() > MAX_SIMILAR_RANKING_REQUEST_BYTES && index >= 0; index -= 1) {
    const candidate = request.candidates[index];
    if (byteLength(candidate.questionText) > 512) {
      request.candidates[index] = { ...candidate, questionText: truncateUtf8(candidate.questionText, 512) };
      truncated = true;
    }
  }
  return { request, truncated, blocked: size() > MAX_SIMILAR_RANKING_REQUEST_BYTES };
}

export function rankLocalSimilarQuestions(context: SimilarQuestionContext, items: QuestionBankItem[], links: SimilarQuestionLink[] = [], limit = 30): LocalSimilarQuestion[] {
  const excluded = new Set(links.filter((link) => link.status === "approved" || link.status === "rejected").map((link) => key(link.targetEntryId, link.targetQuestionNumber)));
  return items.flatMap((candidate) => {
    const isSourceQuestion = candidate.entryId === context.sourceId &&
      (!context.sourceQuestionNumber || key(candidate.entryId, candidate.questionNumber) === key(context.sourceId, context.sourceQuestionNumber));
    if (candidate.subject !== context.subject || isSourceQuestion || excluded.has(key(candidate.entryId, candidate.questionNumber))) return [];
    const sharedConcepts = (candidate.classification.concepts ?? []).filter((concept) => context.concepts.includes(concept));
    const sharedTags = (candidate.classification.tags ?? []).filter((tag) => context.tags.includes(tag));
    const sameUnit = Boolean(candidate.classification.unit && [context.unit, ...(context.units ?? [])].filter(Boolean).includes(candidate.classification.unit));
    const sameSubunit = Boolean(candidate.classification.subunit && [context.subunit, ...(context.subunits ?? [])].filter(Boolean).includes(candidate.classification.subunit));
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

export function createSimilarQuestionLink(candidate: LocalSimilarQuestion, source: "local" | "manual" | "gemini" = "local", now = new Date().toISOString(), provenance?: Pick<SimilarQuestionRankingResponse, "model" | "promptVersion">): SimilarQuestionLink {
  return { id: uuidv4(), targetEntryId: candidate.candidate.entryId, targetQuestionNumber: normalizeQuestionNumber(candidate.candidate.questionNumber), score: candidate.score, reasons: candidate.reasons, sharedConcepts: candidate.sharedConcepts, differences: candidate.differences, source, ...(source === "gemini" && provenance ? provenance : {}), status: "suggested", createdAt: now, updatedAt: now };
}
