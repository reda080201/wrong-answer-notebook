import { v4 as uuidv4 } from "uuid";
import type { ExamBlueprint, ExamGenerationReport, ExamQuestionSnapshot, GeneratedExam, GeneratedExamPreset, GeneratedExamQuestion, QuestionMeta, WrongAnswerEntry } from "../../../types";
import { normalizeQuestionMeta, normalizeQuestionNumber } from "../../../utils/questionMeta";
import { parseQuestionText, type QuestionBlock } from "../../../utils/textLayout";
import { resolveQuestionDifficultyScore } from "../../../utils/difficulty";
import { createQuestionSource } from "./questionSource";

export interface ExamBuilderFilters {
  entryIds?: string[];
  subject?: string;
  units?: string[];
  tags?: string[];
  importantOnly?: boolean;
  wrongOnly?: boolean;
  dueOnly?: boolean;
  excludeNeedsReview?: boolean;
  requireAnswers?: boolean;
  requireExplanations?: boolean;
  excludeRecentDays?: number;
  maxPerSource?: number;
  similarity?: "strict" | "some" | "unlimited";
}

export interface GenerateExamInput {
  entries: WrongAnswerEntry[];
  title: string;
  preset: GeneratedExamPreset;
  blueprint: ExamBlueprint;
  seed: string;
  filters?: ExamBuilderFilters;
  lockedQuestions?: GeneratedExamQuestion[];
  now?: Date;
}

interface Candidate {
  entry: WrongAnswerEntry;
  block: QuestionBlock;
  number: string;
  meta?: QuestionMeta;
  snapshot: ExamQuestionSnapshot;
  difficulty: number;
  importance: number;
  quality: number;
  weakness: number;
  hash: string;
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function stringHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

function seeded(seed: string) {
  let state = Number.parseInt(stringHash(seed), 36) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function questionQualityScore(entry: WrongAnswerEntry, number: string, meta?: QuestionMeta): number {
  const answer = entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === number);
  if (meta?.rating?.userQualityScore !== undefined) return clamp(meta.rating.userQualityScore);
  if (meta?.rating?.qualityScore !== undefined) return clamp(meta.rating.qualityScore);
  let score = 35;
  if (entry.question.trim()) score += 15;
  if (answer?.answer.trim()) score += 15;
  if (answer?.explanation.trim()) score += 12;
  if (!answer?.needsReview && !meta?.needsReview) score += 10;
  if ((entry.figures ?? []).filter((figure) => normalizeQuestionNumber(figure.questionNumber) === number).every((figure) => !figure.needsReview)) score += 6;
  if (meta?.important) score += 5;
  if (entry.importAudit?.missingQuestionNumbers?.length) score -= 15;
  return clamp(score);
}

function snapshot(entry: WrongAnswerEntry, block: QuestionBlock, number: string): ExamQuestionSnapshot {
  const answer = entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === number);
  return {
    id: `${entry.id}-${number}`,
    questionNumber: String(block.numberLabel ?? block.displayNumber),
    question: block.body,
    choices: block.choices.map((choice) => `${choice.marker} ${choice.text}`),
    questionImages: [],
    sourcePageImages: entry.sourcePageImages ?? [],
    figures: (entry.figures ?? []).filter((figure) => normalizeQuestionNumber(figure.questionNumber) === number),
    contentSegments: Object.entries(entry.questionContentSegments ?? {}).find(([key]) => normalizeQuestionNumber(key) === number)?.[1],
    correctAnswer: answer?.answer,
    explanation: answer?.explanation,
  };
}

function collect(entries: WrongAnswerEntry[], filters: ExamBuilderFilters): Candidate[] {
  const cutoff = filters.excludeRecentDays ? Date.now() - filters.excludeRecentDays * 86_400_000 : 0;
  const candidates: Candidate[] = [];
  for (const entry of entries.filter((item) => item.entryKind === "problem_sheet").filter((item) => !filters.entryIds?.length || filters.entryIds.includes(item.id)).filter((item) => !filters.subject || item.subject === filters.subject)) {
    for (const block of parseQuestionText(entry.question).filter((item): item is QuestionBlock => item.kind === "question")) {
      const number = normalizeQuestionNumber(String(block.numberLabel ?? block.displayNumber));
      const meta = normalizeQuestionMeta(entry.questionMeta).find((item) => normalizeQuestionNumber(item.questionNumber) === number);
      const answer = entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === number);
      const concepts = answer?.concepts ?? entry.concepts ?? entry.tags;
      if (filters.units?.length && !filters.units.some((unit) => concepts.includes(unit))) continue;
      if (filters.tags?.length && !filters.tags.some((tag) => entry.tags.includes(tag) || concepts.includes(tag))) continue;
      if (filters.importantOnly && !meta?.important) continue;
      if (filters.wrongOnly && !(meta?.review?.lapseCount || meta?.needsReview || answer?.needsReview)) continue;
      if (filters.dueOnly && !meta?.review?.dueAt) continue;
      if (filters.excludeNeedsReview && (meta?.needsReview || answer?.needsReview)) continue;
      if (filters.requireAnswers && !answer?.answer.trim()) continue;
      if (filters.requireExplanations && !answer?.explanation.trim()) continue;
      if (cutoff && meta?.review?.lastReviewedAt && Date.parse(meta.review.lastReviewedAt) > cutoff) continue;
      const difficulty = resolveQuestionDifficultyScore(entry.questionMeta, entry.answerKey, block) ?? 50;
      const importance = clamp(meta?.rating?.importanceScore ?? (meta?.important ? 85 : 45));
      const quality = questionQualityScore(entry, number, meta);
      const weakness = clamp((meta?.review?.lapseCount ?? 0) * 15 + (meta?.needsReview ? 25 : 0) + (entry.difficult ? 15 : 0));
      candidates.push({ entry, block, number, meta, snapshot: snapshot(entry, block, number), difficulty, importance, quality, weakness, hash: stringHash(`${block.body}\n${block.choices.map((choice) => choice.text).join("|")}`) });
    }
  }
  return candidates;
}

function score(candidate: Candidate, preset: GeneratedExamPreset, target?: { min?: number; max?: number }): number {
  const targetDifficulty = target?.min !== undefined && target?.max !== undefined ? 100 - Math.abs((target.min + target.max) / 2 - candidate.difficulty) : 50;
  const reviewNeed = candidate.weakness;
  if (preset === "hard") return candidate.difficulty * .5 + candidate.quality * .3 + candidate.importance * .2;
  if (preset === "important") return candidate.importance * .45 + candidate.quality * .3 + reviewNeed * .25;
  if (preset === "quality") return candidate.quality * .6 + candidate.importance * .15 + targetDifficulty * .25;
  if (preset === "weakness" || preset === "wrong_retry") return candidate.weakness * .45 + reviewNeed * .25 + candidate.quality * .2 + candidate.importance * .1;
  return candidate.quality * .3 + candidate.importance * .2 + targetDifficulty * .35 + reviewNeed * .15;
}

export function generateExam(input: GenerateExamInput): GeneratedExam {
  const now = input.now ?? new Date();
  const filters = input.filters ?? {};
  const excludedCounts: Record<string, number> = {};
  const candidates = collect(input.entries, filters);
  const rng = seeded(input.seed);
  const maxPerSource = filters.maxPerSource ?? Math.max(1, Math.ceil(input.blueprint.totalQuestions * .3));
  const selected: GeneratedExamQuestion[] = [...(input.lockedQuestions ?? [])].slice(0, input.blueprint.totalQuestions).map((question, index) => {
    if (question.source?.sourceEntryId) return { ...question, position: index + 1, locked: true };
    const legacyEntry = input.entries.find((entry) => entry.id === question.sourceEntryId);
    const number = question.sourceQuestionNumber ?? question.snapshot.questionNumber;
    return { ...question, position: index + 1, locked: true, source: legacyEntry ? createQuestionSource(legacyEntry, number, question.snapshot) : { sourceEntryId: question.sourceEntryId ?? "", sourceEntryTitle: "출처 미확인", sourceQuestionNumber: number, sourceStatus: question.sourceEntryId ? "snapshot_only" : "unknown" } };
  });
  const sourceOf = (item: GeneratedExamQuestion) => item.source ?? { sourceEntryId: item.sourceEntryId ?? "", sourceQuestionNumber: item.sourceQuestionNumber ?? item.snapshot.questionNumber, sourceEntryTitle: "출처 미확인" };
  const used = new Set(selected.map((item) => `${sourceOf(item).sourceEntryId}:${normalizeQuestionNumber(sourceOf(item).sourceQuestionNumber)}`));
  const hashes = new Set(selected.map((item) => stringHash(`${item.snapshot.question}\n${item.snapshot.choices.join("|")}`)));
  const sourceCounts = new Map<string, number>();
  for (const item of selected) { const source = sourceOf(item); sourceCounts.set(source.sourceEntryId, (sourceCounts.get(source.sourceEntryId) ?? 0) + 1); }
  const relaxedConstraints: string[] = [];
  for (let position = selected.length; position < input.blueprint.totalQuestions; position += 1) {
    const slot = input.blueprint.slots[position];
    let pool = candidates.filter((candidate) => !used.has(`${candidate.entry.id}:${candidate.number}`) && (filters.similarity === "unlimited" || !hashes.has(candidate.hash)) && (sourceCounts.get(candidate.entry.id) ?? 0) < maxPerSource);
    if (!pool.length) {
      pool = candidates.filter((candidate) => !used.has(`${candidate.entry.id}:${candidate.number}`) && (filters.similarity === "unlimited" || !hashes.has(candidate.hash)));
      if (pool.length) relaxedConstraints.push(`${position + 1}번 슬롯에서 출처 분산 제한을 완화했습니다.`);
    }
    if (!pool.length) { excludedCounts.insufficient = (excludedCounts.insufficient ?? 0) + 1; continue; }
    const ranked = pool.map((candidate) => ({ candidate, score: score(candidate, input.preset, { min: slot?.targetDifficultyMin, max: slot?.targetDifficultyMax }) + rng() * .01 })).sort((a, b) => b.score - a.score);
    const pick = ranked[0];
    const reasons = [`품질 점수 ${pick.candidate.quality}`, `난이도 ${pick.candidate.difficulty}`, `중요도 ${pick.candidate.importance}`];
    if (pick.candidate.weakness >= 25) reasons.push("복습·오답 신호가 있어 우선했습니다.");
    selected.push({ position: position + 1, source: createQuestionSource(pick.candidate.entry, pick.candidate.number, pick.candidate.snapshot), snapshot: structuredClone(pick.candidate.snapshot), locked: false, selectionScore: Math.round(pick.score), selectionReasons: reasons });
    used.add(`${pick.candidate.entry.id}:${pick.candidate.number}`); hashes.add(pick.candidate.hash); sourceCounts.set(pick.candidate.entry.id, (sourceCounts.get(pick.candidate.entry.id) ?? 0) + 1);
  }
  const report: ExamGenerationReport = { candidateCount: candidates.length, selectedCount: selected.length, excludedCounts, difficultyDistribution: {}, unitDistribution: {}, sourceDistribution: {}, relaxedConstraints, warnings: [], usedGeminiEvaluation: false, generatedAt: now.toISOString() };
  for (const item of selected) {
    const source = sourceOf(item);
    const candidate = candidates.find((value) => value.entry.id === source.sourceEntryId && value.number === normalizeQuestionNumber(source.sourceQuestionNumber));
    const band = candidate ? `${Math.floor(candidate.difficulty / 20) * 20 + 1}-${Math.ceil(candidate.difficulty / 20) * 20}` : "unknown";
    report.difficultyDistribution[band] = (report.difficultyDistribution[band] ?? 0) + 1;
    report.sourceDistribution[source.sourceEntryId] = (report.sourceDistribution[source.sourceEntryId] ?? 0) + 1;
    for (const unit of candidate?.entry.tags ?? []) report.unitDistribution[unit] = (report.unitDistribution[unit] ?? 0) + 1;
  }
  if (selected.length < input.blueprint.totalQuestions) report.warnings.push(`후보가 부족해 ${input.blueprint.totalQuestions - selected.length}개 슬롯을 채우지 못했습니다.`);
  return { id: uuidv4(), title: input.title.trim() || `${input.blueprint.name} ${now.toLocaleDateString("ko-KR")}`, subject: input.filters?.subject ?? (selected[0] ? candidates.find((candidate) => candidate.entry.id === sourceOf(selected[0]).sourceEntryId)?.entry.subject ?? "기타" : "기타"), blueprintId: input.blueprint.id, preset: input.preset, createdAt: now.toISOString(), updatedAt: now.toISOString(), seed: input.seed, status: "draft", timeLimitMinutes: input.blueprint.timeLimitMinutes, totalPoints: input.blueprint.totalPoints, questions: selected, generationReport: report };
}
