import type { ImportWorkspace, ImportWorkspaceWarning } from "../model/importWorkspace";
export function validateImportWorkspace(workspace: ImportWorkspace): ImportWorkspaceWarning[] {
  const warnings: ImportWorkspaceWarning[] = [];
  if (!workspace.groups.length) warnings.push({ id: "no-groups", severity: "error", message: "저장할 회차가 없습니다." });
  const ids = new Set<string>();
  for (const group of workspace.groups) for (const question of group.questions) {
    if (ids.has(question.id)) warnings.push({ id: `duplicate-${question.id}`, severity: "error", message: "중복된 draft 문항 ID입니다.", questionId: question.id });
    ids.add(question.id);
    const segmentText = question.contentSegments.map((segment) => segment.type === "text" || segment.type === "condition" ? segment.text : segment.type === "equation" ? segment.latex : "").join("").trim();
    if (!segmentText && !question.sourceText?.trim()) warnings.push({ id: `empty-${question.id}`, severity: "error", message: "문항 본문이 비어 있습니다.", questionId: question.id, groupId: group.id });
    if (!question.answer) warnings.push({ id: `answer-${question.id}`, severity: "warning", message: "정답이 연결되지 않았습니다.", questionId: question.id, groupId: group.id });
    if (question.status !== "ready") warnings.push({ id: `status-${question.id}`, severity: "warning", message: question.warnings[0] ?? "검토가 필요합니다.", questionId: question.id, groupId: group.id });
  }
  return warnings;
}
