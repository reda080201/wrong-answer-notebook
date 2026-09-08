import type { QuestionBankFilters, QuestionBankItem } from "../model/questionBankTypes";
import { parseSearchQuery, rankSearchCandidates } from "../../../utils/search";

function matchesStructuredFilters(item: QuestionBankItem, filters: QuestionBankFilters): boolean {
  const classification = item.classification;
  if (filters.subject !== "all" && item.subject !== filters.subject) return false;
  if (filters.sourceType !== "all" && item.source.type !== filters.sourceType) return false;
  if (filters.unit !== "all" && classification.unit !== filters.unit) return false;
  if (filters.subunit !== "all" && classification.subunit !== filters.subunit) return false;
  if (filters.concept !== "all" && !(classification.concepts ?? []).includes(filters.concept)) return false;
  if (filters.minDifficulty !== null && (classification.difficultyScore ?? 0) < filters.minDifficulty) return false;
  if (filters.minImportance !== null && (classification.importanceScore ?? 0) < filters.minImportance) return false;
  if (filters.minQuality !== null && (classification.qualityScore ?? 0) < filters.minQuality) return false;
  if (filters.answerType !== "all" && classification.answerType !== filters.answerType) return false;
  if (filters.wrongOnly && !item.isWrong) return false;
  if (filters.answerState === "has" && !item.hasAnswer) return false;
  if (filters.answerState === "missing" && item.hasAnswer) return false;
  if (filters.explanationState === "has" && !item.hasExplanation) return false;
  if (filters.explanationState === "missing" && item.hasExplanation) return false;
  if (filters.hasImages === "has" && !item.hasImages) return false;
  if (filters.hasImages === "missing" && item.hasImages) return false;
  if (filters.reviewDueOnly && !item.reviewDue) return false;
  if (filters.year !== "all" && String(item.source.examYear ?? "") !== filters.year) return false;
  if (filters.tag !== "all" && !(classification.tags ?? []).includes(filters.tag)) return false;
  return true;
}

export function filterQuestionBankItems(items: QuestionBankItem[], filters: QuestionBankFilters): QuestionBankItem[] {
  const candidates = items.filter((item) => matchesStructuredFilters(item, filters));
  const search = filters.search.trim();
  if (!search) return candidates;
  const query = parseSearchQuery(search);
  const matchedSearchIds = new Set(rankSearchCandidates(candidates.map((item) => ({
      id: item.id,
      fields: {
        title: item.entryTitle,
        body: item.questionText,
        subject: item.subject,
        unit: [item.classification.unit, item.classification.subunit].filter(Boolean).join(" "),
        source: [item.source.sourceLabel, item.source.examName, item.source.seriesName].filter(Boolean).join(" "),
        tag: item.classification.tags ?? [],
        metadata: item.classification.concepts ?? [],
      },
    })), query).map((item) => item.id));
  return candidates.filter((item) => matchedSearchIds.has(item.id));
}
