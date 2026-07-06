import { useMemo, useState } from "react";
import type { EntryFormData, Subject } from "../types";
import {
  convertConceptKnowledge,
  detectConceptKnowledgeWarnings,
  normalizeAppCompatibleEntries,
  type ConceptKnowledgeImportMode,
} from "../utils/conceptKnowledgeImport";
import MathText from "./MathText";

interface ConceptImportPreviewModalProps {
  value: unknown;
  fallbackSubject: Subject;
  onClose: () => void;
  onApplyEntries: (entries: Partial<EntryFormData>[]) => Promise<void> | void;
}

const MODE_LABELS: Record<ConceptKnowledgeImportMode, string> = {
  concepts: "개념노트 여러 개로 분리",
  "unit-lectures": "단원별 특강자료로 저장",
  "single-lecture": "하나의 특강자료로 저장",
};

export default function ConceptImportPreviewModal({
  value,
  fallbackSubject,
  onClose,
  onApplyEntries,
}: ConceptImportPreviewModalProps) {
  const appEntries = useMemo(
    () => normalizeAppCompatibleEntries(value, fallbackSubject),
    [fallbackSubject, value],
  );
  const [mode, setMode] = useState<ConceptKnowledgeImportMode>("concepts");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversion = useMemo(
    () =>
      appEntries.length
        ? { entries: appEntries, warnings: detectConceptKnowledgeWarnings(value) }
        : convertConceptKnowledge(value, mode, fallbackSubject),
    [appEntries, fallbackSubject, mode, value],
  );
  const sampleEntries = conversion.entries.slice(0, 6);

  const handleApply = async () => {
    if (!conversion.entries.length) return;
    setSaving(true);
    setError(null);
    try {
      await onApplyEntries(conversion.entries);
      onClose();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "개념 자료 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="개념 자료 JSON 변환">
      <div className="concept-import-modal">
        <header className="modal-head">
          <div>
            <span className="modal-eyebrow">Concept Knowledge Import</span>
            <h2>개념 자료 JSON 변환</h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            닫기
          </button>
        </header>

        {!appEntries.length && (
          <section className="concept-import-modes" aria-label="변환 방식">
            {(Object.entries(MODE_LABELS) as Array<[ConceptKnowledgeImportMode, string]>).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={mode === key ? "active" : ""}
                onClick={() => setMode(key)}
              >
                {label}
              </button>
            ))}
          </section>
        )}

        <section className="concept-import-summary">
          <strong>
            {appEntries.length
              ? `앱 호환 항목 ${conversion.entries.length}개`
              : `${MODE_LABELS[mode]} · ${conversion.entries.length}개 생성 예정`}
          </strong>
          {conversion.warnings.map((warning) => (
            <p key={warning} className="form-warning">
              {warning}
            </p>
          ))}
          {error && <div className="form-error">{error}</div>}
        </section>

        <section className="concept-import-preview" aria-label="변환 미리보기">
          {sampleEntries.length ? (
            sampleEntries.map((entry, index) => (
              <article key={`${entry.entryKind}-${entry.title}-${index}`} className="learning-card">
                <span className="formula-chip">
                  {entry.entryKind === "lecture" ? "특강자료" : "개념"}
                </span>
                <h3>{entry.title || "제목 없음"}</h3>
                {entry.question && <MathText text={entry.question} />}
                {entry.memo && <p className="entry-card-preview">{entry.memo}</p>}
                {entry.learningBlocks?.slice(0, 3).map((block) => (
                  <div key={block.id} className="concept-import-block-preview">
                    <strong>{block.title}</strong>
                    <MathText text={block.content} />
                  </div>
                ))}
              </article>
            ))
          ) : (
            <p className="learning-content-empty">변환할 개념 항목을 찾지 못했습니다.</p>
          )}
        </section>

        <footer className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleApply}
            disabled={!conversion.entries.length || saving}
          >
            {saving ? "저장 중..." : "변환해서 저장"}
          </button>
        </footer>
      </div>
    </div>
  );
}
