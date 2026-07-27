import { useEffect, useMemo, useState } from "react";
import type { EntryFormData } from "../types";
import type { ImportedStudyDocument } from "../utils/importStudyText";
import { classifyImportValidationIssues, validateImportedStudyData } from "../utils/importValidation";
import { parseQuestionText } from "../utils/textLayout";
import Dialog from "../shared/ui/Dialog";

interface ImportEntriesPreviewModalProps {
  document: ImportedStudyDocument;
  onClose: () => void;
  onApplyEntries: (entries: Partial<EntryFormData>[], assetFiles?: File[]) => Promise<void> | void;
}

const ENTRY_KIND_LABELS = {
  wrong_answer: "오답",
  problem_sheet: "시험지",
  concept: "개념",
  lecture: "특강자료",
} as const;

export default function ImportEntriesPreviewModal({
  document,
  onClose,
  onApplyEntries,
}: ImportEntriesPreviewModalProps) {
  const [saving, setSaving] = useState(false);
  const [confirmedWarnings, setConfirmedWarnings] = useState(false);
  const [viewedWarningGroups, setViewedWarningGroups] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(
    () => document.entries.map((entry, index) => {
      const policy = classifyImportValidationIssues(validateImportedStudyData(entry));
      const questionCount = entry.entryKind === "problem_sheet"
        ? parseQuestionText(entry.question ?? "").filter((block) => block.kind === "question").length
        : 0;
      return { entry, index, policy, questionCount };
    }),
    [document.entries],
  );
  const blockingCount = rows.reduce((sum, row) => sum + row.policy.blocking.length, 0);
  const confirmableCount = rows.reduce((sum, row) => sum + row.policy.confirmable.length, 0);
  const confirmableRows = rows.filter((row) => row.policy.confirmable.length > 0);
  const allWarningsViewed = confirmableRows.every((row) => viewedWarningGroups.has(row.index));

  useEffect(() => {
    setViewedWarningGroups(new Set());
    setConfirmedWarnings(false);
  }, [document]);

  const handleApply = async () => {
    if (blockingCount || (confirmableCount > 0 && (!allWarningsViewed || !confirmedWarnings)) || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (document.assetFiles?.length) {
        await onApplyEntries(document.entries, document.assetFiles);
      } else {
        await onApplyEntries(document.entries);
      }
      onClose();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "여러 항목 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} className="concept-import-modal import-entries-modal" ariaLabel="여러 항목 가져오기 미리보기" closeDisabled={saving} busy={saving}>
        <header className="modal-head">
          <div>
            <span className="modal-eyebrow">All-in-one Import</span>
            <h2>{document.title || "여러 항목 가져오기"}</h2>
            <p className="form-hint">
              {document.importType} · {document.entries.length}개 항목
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} disabled={saving}>닫기</button>
        </header>

        {blockingCount > 0 && (
          <div className="form-error" role="alert">
            누락 문제 등 적용 불가 항목이 {blockingCount}개 있습니다. JSON을 수정한 뒤 다시 가져와 주세요.
          </div>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}

        <section className="concept-import-preview import-entries-preview" aria-label="가져올 항목 목록">
          {rows.map(({ entry, index, policy, questionCount }) => (
            <article key={`${entry.entryKind}-${entry.title}-${index}`} className="learning-card import-entry-preview-card">
              <div className="import-entry-preview-head">
                <span className="formula-chip">
                  {ENTRY_KIND_LABELS[entry.entryKind ?? "wrong_answer"]}
                </span>
                <span>{entry.subject || document.subject || "기타"}</span>
              </div>
              <h3>{entry.title || `가져올 항목 ${index + 1}`}</h3>
              <div className="import-entry-preview-counts">
                {entry.entryKind === "problem_sheet" && <span>문항 {questionCount}</span>}
                <span>답안 {entry.answerKey?.length ?? 0}</span>
                <span>도표 {entry.figures?.length ?? 0}</span>
                <span>학습 블록 {entry.learningBlocks?.length ?? 0}</span>
              </div>
              {policy.blocking.map((issue) => (
                <p key={issue.id} className="form-warning">적용 불가: {issue.message}</p>
              ))}
              {policy.confirmable.length > 0 && (
                <details
                  onToggle={(event) => { if (event.currentTarget.open) setViewedWarningGroups((current) => new Set(current).add(index)); }}
                >
                  <summary className="form-hint" onClick={() => setViewedWarningGroups((current) => new Set(current).add(index))}>확인 권장 항목 {policy.confirmable.length}개 보기</summary>
                  {policy.confirmable.map((issue) => <p key={issue.id} className="form-warning">{issue.message}</p>)}
                </details>
              )}
            </article>
          ))}
        </section>

        {confirmableCount > 0 && (
          <label className="settings-checkbox import-warning-confirmation">
            <input type="checkbox" checked={confirmedWarnings} onChange={(event) => setConfirmedWarnings(event.target.checked)} disabled={saving || !allWarningsViewed} />
            {allWarningsViewed ? "확인 권장 항목을 모두 확인했습니다." : `확인 ${viewedWarningGroups.size} / ${confirmableRows.length}개 항목을 펼쳐 보세요.`} ({confirmableCount}개)
          </label>
        )}

        <footer className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>취소</button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleApply}
            disabled={Boolean(blockingCount) || (confirmableCount > 0 && (!allWarningsViewed || !confirmedWarnings)) || saving}
          >
            {saving ? "저장 중..." : `${document.entries.length}개 항목 저장`}
          </button>
        </footer>
    </Dialog>
  );
}
