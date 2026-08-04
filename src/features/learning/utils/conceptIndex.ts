import type { WrongAnswerEntry } from "../../../types";
import { projectLearningBlocks, type LearningHubItem } from "./learningHub";

export interface ConceptIndexItem {
  key: string;
  title: string;
  sourceEntry: WrongAnswerEntry;
  block?: LearningHubItem["block"];
}

/** Uses reviewed concepts first, while leaving the original wiki-link text untouched. */
export function buildConceptIndex(entries: WrongAnswerEntry[]): Map<string, ConceptIndexItem> {
  const indexed = new Map<string, ConceptIndexItem>();
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
      if (key && !indexed.has(key)) indexed.set(key, { key, title: title.trim(), sourceEntry: item.sourceEntry, block: item.block });
    }
  }
  for (const entry of entries) {
    if (entry.entryKind !== "concept" || !entry.title.trim()) continue;
    const key = entry.title.trim().toLocaleLowerCase("ko-KR");
    if (!indexed.has(key)) indexed.set(key, { key, title: entry.title.trim(), sourceEntry: entry });
  }
  return indexed;
}
