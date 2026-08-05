import type { WrongAnswerEntry } from "../../../types";
import { normalizeQuestionMeta, normalizeQuestionNumber } from "../../../utils/questionMeta";
import { projectLearningBlocks, type LearningHubItem } from "./learningHub";

export interface ConceptIndexItem {
  key: string;
  title: string;
  sourceEntry: WrongAnswerEntry;
  block?: LearningHubItem["block"];
}

export interface ConceptLinkResolveContext {
  sourceEntry?: WrongAnswerEntry;
  unit?: string;
  /** Explicit source links take precedence over a loose alias match. */
  referencedEntryIds?: string[];
}

export function buildConceptLinkContext(
  sourceEntry: WrongAnswerEntry,
  questionNumber?: string,
): ConceptLinkResolveContext {
  const normalizedQuestionNumber = questionNumber ? normalizeQuestionNumber(questionNumber) : "";
  const questionMeta = normalizedQuestionNumber
    ? normalizeQuestionMeta(sourceEntry.questionMeta).find((item) => normalizeQuestionNumber(item.questionNumber) === normalizedQuestionNumber)
    : undefined;
  return { sourceEntry, unit: questionMeta?.classification?.unit };
}

export type ConceptIndex = Map<string, ConceptIndexItem[]>;

function conceptKey(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function sameValue(left?: string, right?: string) {
  return Boolean(left && right && conceptKey(left) === conceptKey(right));
}

function isDirectlyRelated(item: ConceptIndexItem, context: ConceptLinkResolveContext) {
  const sourceId = context.sourceEntry?.id;
  if (!sourceId && !context.referencedEntryIds?.length) return false;
  const ids = new Set([sourceId, ...(context.referencedEntryIds ?? [])].filter((id): id is string => Boolean(id)));
  return ids.has(item.sourceEntry.id) || item.block?.sourceReferences?.some((reference) => ids.has(reference.entryId));
}

/** Uses reviewed concepts first, while leaving the original wiki-link text untouched. */
export function buildConceptIndex(entries: WrongAnswerEntry[]): ConceptIndex {
  const indexed: ConceptIndex = new Map();
  const add = (key: string, item: ConceptIndexItem) => {
    const existing = indexed.get(key) ?? [];
    if (!existing.some((candidate) => candidate.sourceEntry.id === item.sourceEntry.id && candidate.block?.id === item.block?.id)) {
      existing.push(item);
      indexed.set(key, existing);
    }
  };
  const ranked = [...projectLearningBlocks(entries)].sort((left, right) => {
    const rank = (item: LearningHubItem) => item.block.reviewStatus === "reviewed" ? 2 : item.block.reviewStatus === "needs_review" ? 0 : 1;
    return rank(right) - rank(left) || right.sourceEntry.updatedAt.localeCompare(left.sourceEntry.updatedAt);
  });
  for (const item of ranked) {
    const lifeEthicsAliases = item.block.subjectMetadata?.subject === "life_ethics"
      ? [
          ...(item.block.subjectMetadata.thinkers ?? []),
          ...(item.block.subjectMetadata.comparisonThinkers ?? []),
          ...(item.block.subjectMetadata.thinkerAliases ?? []),
        ]
      : [];
    for (const title of [
      item.block.title,
      ...(item.block.relatedConcepts ?? []),
      ...(item.block.keywords ?? []),
      ...lifeEthicsAliases,
    ]) {
      const key = title.trim().toLocaleLowerCase("ko-KR");
      if (key) add(key, { key, title: title.trim(), sourceEntry: item.sourceEntry, block: item.block });
    }
  }
  for (const entry of entries) {
    if (entry.entryKind !== "concept" || !entry.title.trim()) continue;
    const key = entry.title.trim().toLocaleLowerCase("ko-KR");
    add(key, { key, title: entry.title.trim(), sourceEntry: entry });
  }
  return indexed;
}

/**
 * Resolves only an unambiguous candidate. When a caller supplies source context,
 * direct references, subject, then unit are used in that order. This deliberately
 * refuses an alias shared by unrelated subjects instead of opening a wrong card.
 */
export function resolveConceptIndexItem(
  index: ConceptIndex,
  target: string,
  context: ConceptLinkResolveContext = {},
): ConceptIndexItem | undefined {
  const candidates = index.get(conceptKey(target)) ?? [];
  if (candidates.length === 0) return undefined;
  const direct = candidates.filter((item) => isDirectlyRelated(item, context));
  const subject = context.sourceEntry?.subject;
  const sameSubject = (direct.length ? direct : candidates).filter((item) => !subject || sameValue(item.sourceEntry.subject, subject));
  const subjectCandidates = sameSubject.length ? sameSubject : direct.length ? direct : !subject ? candidates : [];
  const sameUnit = subjectCandidates.filter((item) => sameValue(item.block?.unit, context.unit));
  const chosen = sameUnit.length ? sameUnit : subjectCandidates;
  return chosen.length === 1 ? chosen[0] : undefined;
}
