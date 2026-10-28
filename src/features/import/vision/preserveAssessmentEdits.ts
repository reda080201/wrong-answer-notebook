import type { EntryFormData, QuestionMeta } from "../../../types";
import type { VisionJobDraft } from "./visionJob";
import { parseVisionAnalysis } from "./visionSchema";
import { normalizeQuestionNumber } from "../../../utils/questionNumber";
export function sameVisionSourceFiles(oldJob?: VisionJobDraft, newJob?: VisionJobDraft): boolean {
  return !!oldJob && !!newJob && JSON.stringify(oldJob.sourceFiles.map(s=>[s.sourceKey,s.sha256])) === JSON.stringify(newJob.sourceFiles.map(s=>[s.sourceKey,s.sha256]));
}
export function sameVisionSourceHashes(oldJob?: VisionJobDraft, newJob?: VisionJobDraft): boolean {
  return !!oldJob && !!newJob && JSON.stringify(oldJob.sourceFiles.map(s=>s.sha256).sort()) === JSON.stringify(newJob.sourceFiles.map(s=>s.sha256).sort());
}
/** Only exact question identity, physical source binding, and numbering permit draft reuse. */
export function canPreserveAssessmentDraft(previous: Partial<EntryFormData> | null, oldJob?: VisionJobDraft, newJob?: VisionJobDraft): boolean {
  if (!previous || !sameVisionSourceFiles(oldJob,newJob)) return false;
  const oldAnalysis = parseVisionAnalysis(oldJob!.analysisText), newAnalysis = parseVisionAnalysis(newJob!.analysisText);
  if (oldAnalysis.entries.length !== 1 || newAnalysis.entries.length !== 1 || oldAnalysis.entries[0].entryKey !== newAnalysis.entries[0].entryKey) return false;
  const oldQuestions = oldAnalysis.entries[0].questions, newQuestions = newAnalysis.entries[0].questions;
  return oldQuestions.length === newQuestions.length && newQuestions.every(question => {
    const matches = oldQuestions.filter(old => old.questionKey === question.questionKey);
    return matches.length === 1 && JSON.stringify([matches[0].source,matches[0].sourceRefs,normalizeQuestionNumber(matches[0].questionNumber ?? "")]) === JSON.stringify([question.source,question.sourceRefs,normalizeQuestionNumber(question.questionNumber ?? "")]);
  });
}
/** Replaces only GPT-produced studyAssessment while retaining the complete edited draft. */
export function applyNewStudyAssessments(previous: Partial<EntryFormData>, next: Partial<EntryFormData>): Partial<EntryFormData> {
  const oldMeta = previous.questionMeta ?? [], newMeta = next.questionMeta ?? [];
  const questionMeta = oldMeta.map(meta => {
    const matches = newMeta.filter(candidate => normalizeQuestionNumber(candidate.questionNumber) === normalizeQuestionNumber(meta.questionNumber));
    if (matches.length !== 1) throw new Error("평가 메타데이터 연결이 모호합니다. 기존 초안을 유지합니다.");
    const updated = { ...meta, studyAssessment: matches[0].studyAssessment, assessmentEvidence: matches[0].assessmentEvidence };
    if (!updated.assessmentEvidence) delete updated.assessmentEvidence;
    return updated;
  });
  if (newMeta.length !== oldMeta.length) throw new Error("평가 문항 구성이 달라 기존 초안을 유지합니다.");
  return { ...previous, questionMeta };
}
/** Same-source reanalysis proposes new AI fields while retaining user-owned values by stable question key. */
export function preserveAssessmentEdits(previous: Partial<EntryFormData> | null, next: Partial<EntryFormData>, oldJob?: VisionJobDraft, newJob?: VisionJobDraft): Partial<EntryFormData> {
  if (!previous || !oldJob || !newJob) return next;
  if (!canPreserveAssessmentDraft(previous,oldJob,newJob)) return next;
  const oldAnalysis = parseVisionAnalysis(oldJob.analysisText), newAnalysis = parseVisionAnalysis(newJob.analysisText);
  if (oldAnalysis.entries.length !== 1 || newAnalysis.entries.length !== 1 || oldAnalysis.entries[0].entryKey !== newAnalysis.entries[0].entryKey) return next;
  const oldQuestions = oldAnalysis.entries[0].questions, newQuestions = newAnalysis.entries[0].questions;
  // Question numbers can be edited or reassigned. Reuse a draft only when every
  // question still has the same stable key and source binding.
  if (oldQuestions.length !== newQuestions.length || newQuestions.some(question => {
    const matches = oldQuestions.filter(old => old.questionKey === question.questionKey);
    return matches.length !== 1 || JSON.stringify([matches[0].source, matches[0].sourceRefs]) !== JSON.stringify([question.source, question.sourceRefs]);
  })) return next;
  const questionMeta = next.questionMeta?.map(meta => {
    const matches = newQuestions.filter(q=>normalizeQuestionNumber(q.questionNumber ?? "") === normalizeQuestionNumber(meta.questionNumber));
    if (matches.length !== 1) return meta;
    const oldQuestion = oldQuestions.find(q=>q.questionKey === matches[0].questionKey)!;
    const oldMeta = previous.questionMeta?.filter(m=>normalizeQuestionNumber(m.questionNumber) === normalizeQuestionNumber(oldQuestion.questionNumber ?? ""));
    if (oldMeta?.length !== 1) return meta;
    return retainUserValues(oldMeta[0],meta);
  });
  // Keep this helper limited to assessment metadata. Content and staged asset
  // references require caller-level stable-key and session remapping.
  return { ...next, questionMeta };
}
export function retainUserValues(old: QuestionMeta, next: QuestionMeta): QuestionMeta {
  return {...next, important:old.important, note:old.note, review:old.review, mistakeAnalysis:old.mistakeAnalysis,
    ...(old.classification?.difficultySource === "manual" ? {difficultyScore:old.difficultyScore,classification:{...next.classification,difficultySource:"manual"}} : {}),
    rating: {...next.rating,...(old.rating?.evaluationSource === "manual" ? old.rating : {}),qualityScore:old.rating?.qualityScore,aiQualityScore:old.rating?.aiQualityScore,userQualityScore:old.rating?.userQualityScore,aiQualityConfidence:old.rating?.aiQualityConfidence},
  };
}
