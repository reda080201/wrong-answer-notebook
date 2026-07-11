import { useMemo, useState } from "react";
import type { EntryFormData } from "../types";
import type { ImportedStudyDocument } from "../utils/importStudyText";
import { classifyImportValidationIssues, validateImportedStudyData } from "../utils/importValidation";
import { parseQuestionText } from "../utils/textLayout";

interface ImportEntriesPreviewModalProps {
  document: ImportedStudyDocument;
  onClose: () => void;
  onApplyEntries: (entries: Partial<EntryFormData>[]) => Promise<void> | void;
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
  const rows = useMemo(
    () => document.entries.map((entry, index) => {
      const policy = entry.entryKind === "problem_sheet"
        ? classifyImportValidationIssues(validateImportedStudyData(entry))
        : { blocking: [], confirmable: [], other: [] };
      const questionCount = entry.entryKind === "problem_sheet"
        ? parseQuestionText(entry.question ?? "").filter((block) => block.kind === "question").length
        : 0;
      return { entry, index, policy, questionCount };
    }),
    [document.entries],
  );
  const blockingCount = rows.reduce((sum, row) => sum + row.policy.blocking.length, 0);

  const handleApply = async () => {
    if (blockingCount || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onApplyEntries(document.entries);
      onClose();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "여러 항목 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="여러 항목 가져오기 미리보기">
      <div className="concept-import-modal import-entries-modal">
        <header className="modal-head">
          <div>
            <span className="modal-eyebrow">All-in-one Import</span>
            <h2>{document.title || "여러 항목 가져오기"}</h2>
            <p className="form-hint">
              {document.importType} · {document.entries.length}개 항목
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>닫기</button>
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
                <p className="form-hint">확인 권장 항목 {policy.confirmable.length}개</p>
              )}
            </article>
          ))}
        </section>

        <footer className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>취소</button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleApply}
            disabled={Boolean(blockingCount) || saving}
          >
            {saving ? "저장 중..." : `${document.entries.length}개 항목 저장`}
          </button>
        </footer>
      </div>
    </div>
  );
}
