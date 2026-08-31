import type { QuestionBankFilters, QuestionBankItem } from "../model/questionBankTypes";
import { rankSearchCandidate } from "../../../utils/searchEngine";

export function filterQuestionBankItems(items: QuestionBankItem[], filters: QuestionBankFilters): QuestionBankItem[] {
  const search = filters.search.trim();
  return items.filter((item) => {
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
    if (!search) return true;
    return rankSearchCandidate({
      title: item.entryTitle,
      number: item.questionNumber,
      subject: item.subject,
      unit: classification.unit,
      body: item.questionText,
      explanation: item.explanation,
      metadata: [...(classification.concepts ?? []), ...(classification.tags ?? []), item.source.sourceLabel, item.source.examName, item.source.seriesName].filter((value): value is string => Boolean(value)),
    }, search).matched;
  });
}
