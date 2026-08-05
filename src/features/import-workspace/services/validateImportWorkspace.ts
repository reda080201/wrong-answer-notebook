import type { ImportWorkspace, ImportWorkspaceWarning } from "../model/importWorkspace";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
export function validateImportWorkspace(workspace: ImportWorkspace): ImportWorkspaceWarning[] {
  const warnings: ImportWorkspaceWarning[] = [];
  if (!workspace.groups.length) warnings.push({ id: "no-groups", severity: "error", message: "저장할 회차가 없습니다." });
  const ids = new Set<string>();
  for (const group of workspace.groups) {
    const displayNumbers = new Set<string>();
    const sourceNumbers = new Set<string>();
    const questionIds = new Set(group.questions.map((question) => question.id));
    for (const question of group.questions) {
      const displayNumber = normalizeQuestionNumber(question.displayQuestionNumber);
      const sourceNumber = normalizeQuestionNumber(question.sourceQuestionNumber ?? question.displayQuestionNumber);
      if (displayNumbers.has(displayNumber)) warnings.push({ id: `duplicate-display-${group.id}-${displayNumber}`, severity: "error", message: `표시 문항 번호가 중복되었습니다: ${question.displayQuestionNumber}`, questionId: question.id, groupId: group.id });
      displayNumbers.add(displayNumber);
      if (sourceNumbers.has(sourceNumber)) warnings.push({ id: `duplicate-source-${group.id}-${sourceNumber}`, severity: "warning", message: `원본 문항 번호가 중복되었습니다: ${question.sourceQuestionNumber ?? question.displayQuestionNumber}`, questionId: question.id, groupId: group.id });
      sourceNumbers.add(sourceNumber);
      if (question.groupId !== group.id) warnings.push({ id: `group-${question.id}`, severity: "error", message: "문항이 존재하지 않거나 다른 group을 참조합니다.", questionId: question.id, groupId: group.id });
      for (const segment of question.contentSegments) if (!segment.id.trim()) warnings.push({ id: `segment-${question.id}`, severity: "error", message: "문항 segment ID가 비어 있습니다.", questionId: question.id, groupId: group.id });
      if (question.answer && normalizeQuestionNumber(question.answer.questionNumber ?? "") !== displayNumber && normalizeQuestionNumber(question.answer.questionNumber ?? "") !== sourceNumber) warnings.push({ id: `answer-number-${question.id}`, severity: "error", message: "정답 문항 번호가 문항과 일치하지 않습니다.", questionId: question.id, groupId: group.id });
      if (question.figures.some((figure) => normalizeQuestionNumber(figure.questionNumber ?? "") && normalizeQuestionNumber(figure.questionNumber ?? "") !== displayNumber && normalizeQuestionNumber(figure.questionNumber ?? "") !== sourceNumber)) warnings.push({ id: `figure-number-${question.id}`, severity: "error", message: "도형 문항 번호가 문항과 일치하지 않습니다.", questionId: question.id, groupId: group.id });
      if (question.sourceReferences.some((reference) => reference.assetId && !workspace.assets.some((asset) => asset.id === reference.assetId))) warnings.push({ id: `asset-${question.id}`, severity: "error", message: "문항이 존재하지 않는 이미지 자산을 참조합니다.", questionId: question.id, groupId: group.id });
      if (!questionIds.has(question.id)) warnings.push({ id: `orphan-${question.id}`, severity: "error", message: "고아 문항 참조입니다.", questionId: question.id, groupId: group.id });
    if (ids.has(question.id)) warnings.push({ id: `duplicate-${question.id}`, severity: "error", message: "중복된 draft 문항 ID입니다.", questionId: question.id });
    ids.add(question.id);
    const segmentText = question.contentSegments.map((segment) => segment.type === "text" || segment.type === "condition" ? segment.text : segment.type === "equation" ? segment.latex : "").join("").trim();
    if (!segmentText && !question.sourceText?.trim()) warnings.push({ id: `empty-${question.id}`, severity: "error", message: "문항 본문이 비어 있습니다.", questionId: question.id, groupId: group.id });
    if (!question.answer) warnings.push({ id: `answer-${question.id}`, severity: "warning", message: "정답이 연결되지 않았습니다.", questionId: question.id, groupId: group.id });
    if (question.status !== "ready") warnings.push({ id: `status-${question.id}`, severity: "warning", message: question.warnings[0] ?? "검토가 필요합니다.", questionId: question.id, groupId: group.id });
    }
  }
  return warnings;
}
