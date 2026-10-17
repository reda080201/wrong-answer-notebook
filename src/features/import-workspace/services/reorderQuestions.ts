import { normalizeQuestionNumber } from "../../../utils/questionNumber";
import type { ImportDraftGroup, ImportQuestionDraft } from "../model/importWorkspace";
export function normalizeQuestionOrder(questions: ImportQuestionDraft[]): ImportQuestionDraft[] { return questions.map((question, index) => ({ ...question, order: index })); }
export function moveQuestion(groups: ImportDraftGroup[], questionId: string, targetGroupId: string, targetIndex: number): ImportDraftGroup[] {
  if (!groups.some((group) => group.id === targetGroupId)) return groups;
  const source = groups.find(group => group.questions.some(question => question.id === questionId));
  const sourceQuestion = source?.questions.find(question => question.id === questionId);
  if (sourceQuestion && source?.id !== targetGroupId) {
    const key = JSON.stringify([normalizeQuestionNumber(sourceQuestion.displayQuestionNumber), sourceQuestion.section ?? ""]);
    const number = normalizeQuestionNumber(sourceQuestion.displayQuestionNumber);
    const hotspots = source?.entryMetadata?.questionSolutionHotspots?.filter(hotspot => hotspot.questionKey === key) ?? [];
    const candidates = source?.solutionHotspotCandidates?.filter(candidate => candidate.questionKey === key) ?? [];
    const crops = source?.entryMetadata?.questionSourceCrops?.filter(crop => normalizeQuestionNumber(crop.questionNumber) === number) ?? [];
    groups = groups.map(group => {
      if (group.id === source?.id) return { ...group,
        entryMetadata: group.entryMetadata && { ...group.entryMetadata,
          questionSolutionHotspots: group.entryMetadata.questionSolutionHotspots?.filter(hotspot => hotspot.questionKey !== key),
          questionSourceCrops: group.entryMetadata.questionSourceCrops?.filter(crop => normalizeQuestionNumber(crop.questionNumber) !== number),
        }, solutionHotspotCandidates: group.solutionHotspotCandidates?.filter(candidate => candidate.questionKey !== key),
      };
      if (group.id !== targetGroupId) return group;
      return { ...group, entryMetadata: { ...group.entryMetadata,
        questionSolutionHotspots: [...(group.entryMetadata?.questionSolutionHotspots ?? []), ...hotspots],
        questionSourceCrops: [...(group.entryMetadata?.questionSourceCrops ?? []), ...crops],
      }, solutionHotspotCandidates: [...(group.solutionHotspotCandidates ?? []), ...candidates] };
    });
  }
  let moved: ImportQuestionDraft | undefined;
  const without = groups.map((group) => ({ ...group, questions: normalizeQuestionOrder(group.questions.filter((question) => { if (question.id !== questionId) return true; moved = { ...question, groupId: targetGroupId }; return false; })) }));
  if (!moved) return groups;
  return without.map((group) => group.id !== targetGroupId ? group : ({ ...group, questions: normalizeQuestionOrder([...group.questions.slice(0, targetIndex), moved!, ...group.questions.slice(targetIndex)]) }));
}
