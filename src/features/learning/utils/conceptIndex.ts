import type { WrongAnswerEntry } from "../../../types";
import { projectLearningBlocks, type LearningHubItem } from "./learningHub";

export interface ConceptIndexItem {
  key: string;
  title: string;
  item: LearningHubItem;
}

/** Uses reviewed concepts first, while leaving the original wiki-link text untouched. */
export function buildConceptIndex(entries: WrongAnswerEntry[]): Map<string, ConceptIndexItem> {
  const indexed = new Map<string, ConceptIndexItem>();
  const ranked = [...projectLearningBlocks(entries)].sort((left, right) => {
    const rank = (item: LearningHubItem) => item.block.reviewStatus === "reviewed" ? 2 : item.block.reviewStatus === "needs_review" ? 0 : 1;
    return rank(right) - rank(left) || right.sourceEntry.updatedAt.localeCompare(left.sourceEntry.updatedAt);
  });
  for (const item of ranked) {
    for (const title of [item.block.title, ...(item.block.relatedConcepts ?? []), ...(item.block.keywords ?? [])]) {
      const key = title.trim().toLocaleLowerCase("ko-KR");
      if (key && !indexed.has(key)) indexed.set(key, { key, title: title.trim(), item });
    }
  }
  return indexed;
}
