import type { ImportDraftGroup } from "../model/importWorkspace";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export function renameQuestionNumber(group: ImportDraftGroup, questionId: string, newNumber: string): ImportDraftGroup {
  const question = group.questions.find((item) => item.id === questionId);
  if (!question) return group;
  const normalized = normalizeQuestionNumber(newNumber);
  if (!normalized) return group;
  const oldNumbers = new Set([question.displayQuestionNumber, question.sourceQuestionNumber ?? ""].map(normalizeQuestionNumber));
  const oldKey = JSON.stringify([normalizeQuestionNumber(question.displayQuestionNumber), question.section ?? ""]);
  const newKey = JSON.stringify([normalized, question.section ?? ""]);
  const unique = group.questions.filter(item => JSON.stringify([normalizeQuestionNumber(item.displayQuestionNumber), item.section ?? ""]) === oldKey).length === 1;
  const renamedQuestion = {
    ...question,
    displayQuestionNumber: newNumber,
    sourceQuestionNumber: question.sourceQuestionNumber === question.displayQuestionNumber ? newNumber : question.sourceQuestionNumber,
    answer: question.answer && oldNumbers.has(normalizeQuestionNumber(question.answer.questionNumber ?? ""))
      ? { ...question.answer, questionNumber: newNumber }
      : question.answer,
    figures: question.figures.map((figure) => oldNumbers.has(normalizeQuestionNumber(figure.questionNumber ?? "")) ? { ...figure, questionNumber: newNumber } : figure),
    sourceReferences: question.sourceReferences.map((reference) => ({ ...reference })),
  };
  return {
    ...group,
    entryMetadata: group.entryMetadata && { ...group.entryMetadata, questionSolutionHotspots: group.entryMetadata.questionSolutionHotspots?.filter(hotspot => unique || hotspot.questionKey !== oldKey).map(hotspot => hotspot.questionKey === oldKey ? { ...hotspot, questionKey: newKey } : hotspot) },
    solutionHotspotCandidates: group.solutionHotspotCandidates?.map(candidate => candidate.questionKey === oldKey ? { ...candidate, questionKey: unique ? newKey : "", confirmed: false } : candidate),
    questions: group.questions.map((item) => item.id === questionId ? renamedQuestion : item),
    answerItems: group.answerItems.map((answer) => oldNumbers.has(normalizeQuestionNumber(answer.questionNumber ?? "")) ? { ...answer, questionNumber: newNumber } : answer),
  };
}
