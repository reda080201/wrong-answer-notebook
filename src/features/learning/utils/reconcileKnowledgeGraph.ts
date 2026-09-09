import type { KnowledgeGraphStore } from "../../../types";
import type { QuestionBankItem } from "../../question-bank/model/questionBankTypes";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

/** Reports persisted links whose canonical question no longer exists. Cleanup is maintenance-only. */
export function reconcileKnowledgeGraphQuestionLinks(graph: KnowledgeGraphStore, items: QuestionBankItem[]) {
  const available = new Set(items.map((item) => `${item.entryId}:${normalizeQuestionNumber(item.questionNumber)}`));
  return graph.questionLinks.filter((link) => !available.has(`${link.entryId}:${normalizeQuestionNumber(link.questionNumber)}`));
}
