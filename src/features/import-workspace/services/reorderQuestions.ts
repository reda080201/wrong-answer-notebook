import type { ImportDraftGroup, ImportQuestionDraft } from "../model/importWorkspace";
export function normalizeQuestionOrder(questions: ImportQuestionDraft[]): ImportQuestionDraft[] { return questions.map((question, index) => ({ ...question, order: index })); }
export function moveQuestion(groups: ImportDraftGroup[], questionId: string, targetGroupId: string, targetIndex: number): ImportDraftGroup[] {
  let moved: ImportQuestionDraft | undefined;
  const without = groups.map((group) => ({ ...group, questions: normalizeQuestionOrder(group.questions.filter((question) => { if (question.id !== questionId) return true; moved = { ...question, groupId: targetGroupId }; return false; })) }));
  if (!moved) return groups;
  return without.map((group) => group.id !== targetGroupId ? group : ({ ...group, questions: normalizeQuestionOrder([...group.questions.slice(0, targetIndex), moved!, ...group.questions.slice(targetIndex)]) }));
}
