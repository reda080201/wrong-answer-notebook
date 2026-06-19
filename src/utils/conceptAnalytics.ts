import type { MistakeCauseType, WrongAnswerEntry } from "../types";
import { getEntryConceptLinks } from "./concepts";
import { isDueForReview } from "./review";

export interface ConceptAnalyticsItem {
  concept: string;
  relatedEntries: WrongAnswerEntry[];
  failureCount: number;
  dueCount: number;
  reviewSuccessRate: number | null;
  primaryCauses: Array<{ type: MistakeCauseType; count: number }>;
  edgeStrength: number;
}

export interface LearningDashboardStats {
  topCauses: Array<{ type: MistakeCauseType; count: number }>;
  weakConcepts: ConceptAnalyticsItem[];
  recentReviewCount: number;
  repeatedFailures: WrongAnswerEntry[];
}

function conceptKey(value: string): string {
  return value.trim().toLowerCase();
}

function collectConceptLabels(entries: WrongAnswerEntry[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const entry of entries) {
    if (entry.entryKind === "concept" && entry.title.trim()) {
      labels.set(conceptKey(entry.title), entry.title.trim());
    }
    for (const label of getEntryConceptLinks(entry)) {
      if (label.trim()) labels.set(conceptKey(label), label.trim());
    }
  }
  return labels;
}

function reviewSuccessRate(entry: WrongAnswerEntry): { good: number; total: number } {
  const history = entry.review?.history ?? [];
  return {
    good: history.filter((event) => event.result === "good").length,
    total: history.length,
  };
}

export function buildConceptAnalytics(entries: WrongAnswerEntry[], now = new Date()): ConceptAnalyticsItem[] {
  const labels = collectConceptLabels(entries);
  const items: ConceptAnalyticsItem[] = [];
  for (const [key, label] of labels) {
    const related = entries.filter((entry) => {
      if (entry.entryKind === "concept" && conceptKey(entry.title) === key) return false;
      return getEntryConceptLinks(entry).some((concept) => conceptKey(concept) === key);
    });
    const causeCounts = new Map<MistakeCauseType, number>();
    let good = 0;
    let total = 0;
    for (const entry of related) {
      for (const cause of entry.mistakeAnalysis?.causes ?? []) {
        causeCounts.set(cause.type, (causeCounts.get(cause.type) ?? 0) + 1);
      }
      const rate = reviewSuccessRate(entry);
      good += rate.good;
      total += rate.total;
    }
    const failureCount = related.filter((entry) => !entry.mastered).length;
    items.push({
      concept: label,
      relatedEntries: related,
      failureCount,
      dueCount: related.filter((entry) => isDueForReview(entry, now)).length,
      reviewSuccessRate: total > 0 ? good / total : null,
      primaryCauses: [...causeCounts.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      edgeStrength: related.length + failureCount,
    });
  }
  return items.sort((a, b) => b.edgeStrength - a.edgeStrength);
}

export function buildLearningDashboardStats(entries: WrongAnswerEntry[], now = new Date()): LearningDashboardStats {
  const causeCounts = new Map<MistakeCauseType, number>();
  for (const entry of entries) {
    for (const cause of entry.mistakeAnalysis?.causes ?? []) {
      causeCounts.set(cause.type, (causeCounts.get(cause.type) ?? 0) + 1);
    }
  }
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  return {
    topCauses: [...causeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    weakConcepts: buildConceptAnalytics(entries, now).slice(0, 5),
    recentReviewCount: entries.reduce(
      (count, entry) =>
        count +
        (entry.review?.history ?? []).filter((event) => new Date(event.reviewedAt).getTime() >= weekStart.getTime()).length,
      0,
    ),
    repeatedFailures: entries
      .filter((entry) => (entry.review?.history ?? []).filter((event) => event.result === "again").length >= 2)
      .slice(0, 5),
  };
}
