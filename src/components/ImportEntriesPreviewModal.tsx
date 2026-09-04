import { useMemo, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [excludedIndexes, setExcludedIndexes] = useState<Set<number>>(new Set());
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
  const includedRows = rows.filter((row) => !excludedIndexes.has(row.index) && row.policy.blocking.length === 0);
  const excludedCount = rows.length - includedRows.length;
  const handleApply = async () => {
    if (!includedRows.length || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (document.assetFiles?.length) {
        await onApplyEntries(includedRows.map((row) => row.entry), document.assetFiles);
      } else {
        await onApplyEntries(includedRows.map((row) => row.entry));
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
            적용 불가 항목 {blockingCount}개는 이번 저장에서 제외됩니다. 나머지 항목은 계속 가져올 수 있습니다.
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
              <button type="button" className="btn-secondary btn-sm" onClick={() => setExcludedIndexes((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} disabled={saving || policy.blocking.length > 0}>{excludedIndexes.has(index) ? "저장 대상에 다시 포함" : "이 항목 제외"}</button>
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
                <details>
                  <summary className="form-hint">검토 권장 항목 {policy.confirmable.length}개 보기</summary>
                  {policy.confirmable.map((issue) => <p key={issue.id} className="form-warning">{issue.message}</p>)}
                </details>
              )}
            </article>
          ))}
        </section>

        <p className="form-hint">전체 {rows.length}개 · 저장 가능 {includedRows.length}개 · 확인 필요 {confirmableCount}개 · 제외됨 {excludedCount}개</p>

        <footer className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>취소</button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleApply}
            disabled={!includedRows.length || saving}
          >
            {saving ? "저장 중..." : `${includedRows.length}개 항목 저장`}
          </button>
        </footer>
    </Dialog>
  );
}
