import type { EntryFormData } from "../../../types";
import type { ImportWorkspace } from "../model/importWorkspace";
import { questionDraftToEntryData } from "../model/importWorkspace";
import { validateImportWorkspace } from "./validateImportWorkspace";
export function commitImportWorkspace(workspace: ImportWorkspace, options: { groupIds?: string[]; allowWarnings?: boolean } = {}): { entries: Partial<EntryFormData>[]; warnings: ReturnType<typeof validateImportWorkspace> } {
  const warnings = validateImportWorkspace(workspace);
  if (warnings.some((warning) => warning.severity === "error")) throw new Error("치명적 오류가 있는 문항은 먼저 수정해야 합니다.");
  if (!options.allowWarnings && warnings.some((warning) => warning.severity === "warning")) throw new Error("검토 필요 항목을 확인한 뒤 저장을 승인해 주세요.");
  const selected = new Set(options.groupIds ?? workspace.groups.map((group) => group.id));
  return { entries: workspace.groups.filter((group) => selected.has(group.id) && group.questions.length).map((group) => questionDraftToEntryData(group)), warnings };
}
