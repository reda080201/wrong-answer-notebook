import type { ImportDraftGroup } from "../model/importWorkspace";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export function renameQuestionNumber(group: ImportDraftGroup, questionId: string, newNumber: string): ImportDraftGroup {
  const question = group.questions.find((item) => item.id === questionId);
  if (!question) return group;
  const normalized = normalizeQuestionNumber(newNumber);
  if (!normalized) return group;
  const oldNumbers = new Set([question.displayQuestionNumber, question.sourceQuestionNumber ?? ""].map(normalizeQuestionNumber));
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
    questions: group.questions.map((item) => item.id === questionId ? renamedQuestion : item),
    answerItems: group.answerItems.map((answer) => oldNumbers.has(normalizeQuestionNumber(answer.questionNumber ?? "")) ? { ...answer, questionNumber: newNumber } : answer),
  };
}
