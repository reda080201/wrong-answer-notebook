import type { ImportWorkspace } from "../../import-workspace/model/importWorkspace";
import { normalizeQuestionNumber } from "../../../utils/questionNumber";
import { mapVisionAssessment } from "./assessmentMapping";
import { mapAssessmentLearning } from "./assessmentLearning";
import { retainUserValues } from "./preserveAssessmentEdits";
import { parseVisionAnalysis } from "./visionSchema";

export function bindWorkspaceVision(workspace: ImportWorkspace): ImportWorkspace {
  if (!workspace.visionJob) return workspace;
  const analysis = parseVisionAnalysis(workspace.visionJob.analysisText);
  if (workspace.groups.length !== analysis.entries.length) throw new Error("관측 자료와 작업실 자료 수가 다릅니다.");
  return {...workspace, groups:workspace.groups.map((group,index) => {
    const entry = analysis.entries[index];
    return {...group, visionEntryKey:entry.entryKey, questions:group.questions.map(question => {
      const matches = entry.questions.filter(item => normalizeQuestionNumber(item.questionNumber ?? "") === normalizeQuestionNumber(question.sourceQuestionNumber ?? question.displayQuestionNumber));
      if (matches.length !== 1) throw new Error("관측 문항 키가 모호합니다.");
      return {...question, visionQuestionKey:matches[0].questionKey};
    })};
  })};
}

/** An explicit assessment update never replaces edited questions, answers or assets. */
export function updateWorkspaceAssessment(workspace: ImportWorkspace, text: string): ImportWorkspace {
  if (!workspace.visionJob || workspace.commitAttempt) throw new Error("확정 저장 중에는 평가를 변경할 수 없습니다.");
  const previous = parseVisionAnalysis(workspace.visionJob.analysisText);
  const next = parseVisionAnalysis(text);
  if (next.schemaVersion !== "wrong-answer-notebook-vision-v2" || JSON.stringify(previous.sources) !== JSON.stringify(next.sources)) throw new Error("같은 원본의 v2 평가를 선택하세요.");
  if (previous.entries.length !== next.entries.length || workspace.groups.length !== next.entries.length) throw new Error("자료 구성이 바뀌었습니다. 기존 작업실을 보존하고 별도로 가져오세요.");
  const now = new Date().toISOString();
  const groups = workspace.groups.map(group => {
    // This binding is assigned at workspace creation, before any reorder/rename.
    const key = group.visionEntryKey;
    const oldEntry = previous.entries.find(entry => entry.entryKey === key);
    const newEntry = next.entries.find(entry => entry.entryKey === key);
    if (!oldEntry || !newEntry || oldEntry.questions.length !== newEntry.questions.length) throw new Error("자료 키 연결을 확인할 수 없습니다. 번호나 제목으로 추측하지 않습니다.");
    const metas = [...(group.entryMetadata?.questionMeta ?? [])];
    const candidates = mapAssessmentLearning(newEntry);
    for (const question of newEntry.questions) {
      const old = oldEntry.questions.find(item => item.questionKey === question.questionKey);
      if (!old || JSON.stringify([old.source,old.sourceRefs]) !== JSON.stringify([question.source,question.sourceRefs])) throw new Error("문항 키 또는 원본 연결이 바뀌었습니다. 별도로 가져오세요.");
      const drafts = group.questions.filter(item => item.visionQuestionKey === question.questionKey);
      if (drafts.length !== 1) throw new Error("작업실 문항 키가 모호합니다. 기존 편집 내용은 유지됩니다.");
      const number = drafts[0].displayQuestionNumber;
      if (group.questions.filter(item => normalizeQuestionNumber(item.displayQuestionNumber) === normalizeQuestionNumber(number)).length !== 1) throw new Error("중복 문항 번호의 평가를 연결할 수 없습니다.");
      const indexes = metas.flatMap((meta,index) => normalizeQuestionNumber(meta.questionNumber) === normalizeQuestionNumber(number) ? [index] : []);
      if (indexes.length > 1) throw new Error("기존 평가 연결이 모호합니다.");
      const mapped = mapVisionAssessment(question, question.questionKey, now).meta;
      if (!mapped) throw new Error("풀이·평가가 없는 문항이 있습니다.");
      mapped.questionNumber = number;
      if (indexes.length) {
        const current = metas[indexes[0]];
        const merged = retainUserValues(current, mapped);
        merged.difficultyScore = current.difficultyScore;
        merged.rating = current.rating;
        merged.classification = current.classification;
        if (JSON.stringify(old) === JSON.stringify(question) && JSON.stringify(current.studyAssessment) === JSON.stringify(mapped.studyAssessment)) merged.assessmentEvidence = current.assessmentEvidence;
        metas[indexes[0]] = merged;
      } else metas.push(mapped);
      const ownedIds = new Set(mapAssessmentLearning({...newEntry, questions:[question]}).map(block => block.id));
      candidates.filter(block => ownedIds.has(block.id)).forEach(block => { block.sourceQuestionNumber = number; });
    }
    const blocks = [...(group.entryMetadata?.learningBlocks ?? [])];
    for (const block of candidates) if (!blocks.some(existing => existing.id === block.id)) blocks.push(block);
    return {...group, entryMetadata:{...group.entryMetadata, questionMeta:metas, learningBlocks:blocks}};
  });
  return {...workspace, groups, visionJob:{...workspace.visionJob, analysisText:text, draftAnalysisText:text, assessmentEvidence:JSON.stringify(previous) === JSON.stringify(next) ? workspace.visionJob.assessmentEvidence : undefined}};
}
