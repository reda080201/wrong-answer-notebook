import type { LearningBlock, LearningSubjectDomain, WrongAnswerEntry } from "../../../types";
import { inferLearningSubjectDomain } from "../model/learningMetadata";
import { normalizeThinkerName, thinkerMatches } from "./normalizeThinkerName";
import { rankSearchCandidate } from "../../../utils/searchEngine";

export interface LearningHubItem {
  block: LearningBlock;
  sourceEntry: WrongAnswerEntry;
  sourceEntryId: string;
  sourceEntryTitle: string;
  sourceSubject: string;
  domain: LearningSubjectDomain;
}

export interface LearningHubFilters {
  search: string;
  domain: LearningSubjectDomain | "all";
  unit: string | "all";
  type: LearningBlock["type"] | "all";
  importance: NonNullable<LearningBlock["importance"]> | "all";
  reviewStatus: NonNullable<LearningBlock["reviewStatus"]> | "all";
  linkedOnly: boolean;
  thinkers: string[];
  lifeEthicsKinds: Array<"passage_clue" | "incorrect_choice">;
}

export const DEFAULT_LEARNING_HUB_FILTERS: LearningHubFilters = {
  search: "",
  domain: "all",
  unit: "all",
  type: "all",
  importance: "all",
  reviewStatus: "all",
  linkedOnly: false,
  thinkers: [],
  lifeEthicsKinds: [],
};

const LOW_QUALITY_TITLES = new Set(["instruction", "in'sight", "insight", "concept", "learning", "note", "summary"]);

export function isLowQualityLearningTitle(title: string | undefined): boolean {
  const normalized = title?.trim().toLocaleLowerCase("en-US") ?? "";
  return normalized.length === 0 || LOW_QUALITY_TITLES.has(normalized);
}

export function projectLearningBlocks(entries: WrongAnswerEntry[]): LearningHubItem[] {
  return entries.flatMap((sourceEntry) => (sourceEntry.learningBlocks ?? []).map((block) => ({
    block,
    sourceEntry,
    sourceEntryId: sourceEntry.id,
    sourceEntryTitle: sourceEntry.title,
    sourceSubject: sourceEntry.subject,
    domain: block.subjectDomain ?? inferLearningSubjectDomain(sourceEntry.subject),
  })));
}

function values(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(values);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(values);
  return [];
}

export function getLearningBlockSearchText(item: LearningHubItem): string {
  const block = item.block;
  return [
    block.title,
    block.content,
    block.unit,
    block.subunit,
    ...(block.keywords ?? []),
    ...(block.commonTraps ?? []),
    ...(block.relatedConcepts ?? []),
    ...(block.passageExamples ?? []).flatMap((example) => [example.text, example.explanation ?? "", ...(example.clues ?? [])]),
    ...(block.choiceExamples ?? []).flatMap((example) => [example.text, example.reason ?? ""]),
    ...(block.sourceReferences ?? []).flatMap((reference) => [reference.entryTitle ?? "", reference.questionNumber ?? ""]),
    ...values(block.subjectMetadata),
    item.sourceEntryTitle,
    item.sourceSubject,
  ].join(" ").toLocaleLowerCase("ko-KR");
}

export function filterLearningBlocks(items: LearningHubItem[], filters: LearningHubFilters): LearningHubItem[] {
  const search = filters.search.trim();
  return items.filter((item) => {
    const { block } = item;
    if (filters.domain !== "all" && item.domain !== filters.domain) return false;
    if (filters.unit !== "all" && block.unit !== filters.unit) return false;
    if (filters.type !== "all" && block.type !== filters.type) return false;
    if (filters.importance !== "all" && (block.importance ?? "reference") !== filters.importance) return false;
    if (filters.reviewStatus !== "all" && (block.reviewStatus ?? "draft") !== filters.reviewStatus) return false;
    if (filters.linkedOnly && !(block.sourceQuestionNumber || block.sourceReferences?.length)) return false;
    if (filters.thinkers.length > 0) {
      const metadata = block.subjectMetadata?.subject === "life_ethics" ? block.subjectMetadata : undefined;
      if (!metadata || !thinkerMatches([...(metadata.thinkers ?? []), ...(metadata.comparisonThinkers ?? []), ...(metadata.thinkerAliases ?? [])], filters.thinkers)) return false;
    }
    if (filters.lifeEthicsKinds.length > 0) {
      const metadata = block.subjectMetadata?.subject === "life_ethics" ? block.subjectMetadata : undefined;
      const kinds = new Set<"passage_clue" | "incorrect_choice">();
      if ((metadata?.passageClues?.length ?? 0) > 0 || metadata?.knowledgeType === "passage_pattern") kinds.add("passage_clue");
      if ((metadata?.rejectedClaims?.length ?? 0) > 0 || block.choiceExamples?.some((example) => example.verdict === "incorrect")) kinds.add("incorrect_choice");
      if (!filters.lifeEthicsKinds.some((kind) => kinds.has(kind))) return false;
    }
    return !search || rankSearchCandidate({
      title: block.title,
      unit: block.unit,
      subject: item.sourceSubject,
      body: block.content,
      tag: block.keywords,
      metadata: [...(block.keywords ?? []), ...(block.relatedConcepts ?? []), getLearningBlockSearchText(item)],
    }, search).matched;
  });
}

export function learningHubThinkers(items: LearningHubItem[]): string[] {
  return [...new Set(items.flatMap((item) => {
    const metadata = item.block.subjectMetadata;
    return metadata?.subject === "life_ethics" ? [...(metadata.thinkers ?? []), ...(metadata.comparisonThinkers ?? [])].map(normalizeThinkerName) : [];
  }))].sort((left, right) => left.localeCompare(right, "ko"));
}

export function learningHubUnits(items: LearningHubItem[]): string[] {
  return [...new Set(items.map((item) => item.block.unit?.trim()).filter((unit): unit is string => Boolean(unit)))].sort((a, b) => a.localeCompare(b, "ko"));
}
