import type { EntryFormData, QuestionMeta } from "../../../types";
import type { VisionJobDraft } from "./visionJob";
import { parseVisionAnalysis } from "./visionSchema";
import { normalizeQuestionNumber } from "../../../utils/questionNumber";
/** Same-source reanalysis proposes new AI fields while retaining user-owned values by stable question key. */
export function preserveAssessmentEdits(previous: Partial<EntryFormData> | null, next: Partial<EntryFormData>, oldJob?: VisionJobDraft, newJob?: VisionJobDraft): Partial<EntryFormData> {
  if (!previous || !oldJob || !newJob || JSON.stringify(oldJob.sourceFiles.map(s=>[s.sourceKey,s.sha256])) !== JSON.stringify(newJob.sourceFiles.map(s=>[s.sourceKey,s.sha256]))) return next;
  const oldAnalysis = parseVisionAnalysis(oldJob.analysisText), newAnalysis = parseVisionAnalysis(newJob.analysisText);
  if (oldAnalysis.entries.length !== 1 || newAnalysis.entries.length !== 1 || oldAnalysis.entries[0].entryKey !== newAnalysis.entries[0].entryKey) return next;
  const oldQuestions = oldAnalysis.entries[0].questions, newQuestions = newAnalysis.entries[0].questions;
  return {...next, questionMeta: next.questionMeta?.map(meta => {
    const matches = newQuestions.filter(q=>normalizeQuestionNumber(q.questionNumber ?? "") === normalizeQuestionNumber(meta.questionNumber));
    if (matches.length !== 1) return meta;
    const oldMatches = oldQuestions.filter(q=>q.questionKey === matches[0].questionKey);
    if (oldMatches.length !== 1) return meta;
    const oldMeta = previous.questionMeta?.filter(m=>normalizeQuestionNumber(m.questionNumber) === normalizeQuestionNumber(oldMatches[0].questionNumber ?? ""));
    if (oldMeta?.length !== 1) return meta;
    return retainUserValues(oldMeta[0],meta);
  })};
}
export function retainUserValues(old: QuestionMeta, next: QuestionMeta): QuestionMeta {
  return {...next, important:old.important, note:old.note, review:old.review, mistakeAnalysis:old.mistakeAnalysis,
    ...(old.classification?.difficultySource === "manual" ? {difficultyScore:old.difficultyScore,classification:{...next.classification,difficultySource:"manual"}} : {}),
    rating: {...next.rating,...(old.rating?.evaluationSource === "manual" ? old.rating : {}),qualityScore:old.rating?.qualityScore,aiQualityScore:old.rating?.aiQualityScore,userQualityScore:old.rating?.userQualityScore,aiQualityConfidence:old.rating?.aiQualityConfidence},
  };
}
