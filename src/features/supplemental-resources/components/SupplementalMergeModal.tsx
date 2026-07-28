import { useMemo, useState } from "react";
import type { EntryFormData, WrongAnswerEntry } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";
import {
  analyzeAnswerMerge,
  type AnswerMergeResolution,
} from "../services/mergeAnswerKey";
import type { SupplementalImportMode } from "../model/supplementalResource";
import { supplementalModeLabel } from "../model/supplementalResource";
import type { ImportWorkspace } from "../../import-workspace/model/importWorkspace";

interface SupplementalMergeModalProps {
  target: WrongAnswerEntry;
  imported: Partial<EntryFormData>;
  mode: SupplementalImportMode;
  assetFiles: File[];
  assetSession?: ImportWorkspace["assetSession"];
  onClose: () => void;
  onSave: (payload: { data: Partial<EntryFormData>; mode: SupplementalImportMode; title: string; resolutions: AnswerMergeResolution[]; assetFiles: File[]; assetSession?: ImportWorkspace["assetSession"] }) => Promise<void>;
}

const STATUS_LABEL: Record<string, string> = {
  add: "추가",
  supplement: "해설 보충",
  unchanged: "변경 없음",
  conflict: "충돌",
  unmatched: "수동 연결 필요",
  duplicate: "중복",
};

function rowText(value: unknown): string {
  if (value === undefined || value === null) return "없음";
  if (typeof value === "string") return value || "없음";
  return JSON.stringify(value);
}

export default function SupplementalMergeModal({ target, imported, mode, assetFiles, assetSession, onClose, onSave }: SupplementalMergeModalProps) {
  const analysis = useMemo(() => analyzeAnswerMerge(target, imported), [imported, target]);
  const [title, setTitle] = useState(`${target.title} · ${supplementalModeLabel(mode)}`);
  const [resolutions, setResolutions] = useState<AnswerMergeResolution[]>(() => analysis.rows.map((row) => ({
    key: row.key,
    excluded: row.status === "unmatched",
    useDuplicate: false,
    fieldChoices: Object.fromEntries(row.fieldConflicts.map((conflict) => [conflict.field, "existing"])),
  })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolutionFor = (key: string) => resolutions.find((item) => item.key === key);
  const updateResolution = (key: string, patch: Partial<AnswerMergeResolution>) => {
    setResolutions((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  };
  const duplicateNumbers = new Set(analysis.rows.filter((row) => row.status === "duplicate").map((row) => row.questionNumber));
  const duplicateResolved = [...duplicateNumbers].every((number) => {
    const rows = analysis.rows.filter((row) => row.status === "duplicate" && row.questionNumber === number);
    return rows.some((row) => resolutionFor(row.key)?.useDuplicate) || rows.every((row) => resolutionFor(row.key)?.excluded);
  });
  const canSave = duplicateResolved && !saving;

  const save = async () => {
    if (!canSave) {
      setError("중복 답안을 해결한 뒤 저장할 수 있습니다.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ data: imported, mode, title, resolutions, assetFiles, assetSession });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "추가 자료를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} className="form-modal form-modal--wide supplemental-merge-modal" ariaLabel="추가 자료 병합 검토" closeDisabled={saving} busy={saving}>
      <div className="form-header">
        <div>
          <h2>추가 자료 병합 검토</h2>
          <p>{target.title} · {target.subject}</p>
        </div>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="병합 검토 닫기" disabled={saving}>닫기</button>
      </div>
      <div className="form-body">
        <label className="form-field">
          자료 제목
          <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving} />
        </label>
        <p className="muted">기존 정답·해설은 기본적으로 유지됩니다. 충돌 행에서 새 값을 선택한 경우에만 해당 필드를 바꿉니다.</p>
        {analysis.blockingIssues.length > 0 && <div className="app-error-banner" role="alert">{analysis.blockingIssues.join(" ")}</div>}
        <div className="supplemental-merge-table" role="table" aria-label="답안 병합 비교">
          {analysis.rows.length === 0 && <p className="list-empty">문항별 답안은 없으며 추가 이미지·해설 자료만 연결됩니다.</p>}
          {analysis.rows.map((row) => {
            const resolution = resolutionFor(row.key);
            const conflictFields = row.fieldConflicts.map((item) => item.field);
            return (
              <article key={row.key} className={`supplemental-merge-row supplemental-merge-row--${row.status}`}>
                <header>
                  <strong>{row.questionNumber}번</strong>
                  <span className="entry-mini-badge">{STATUS_LABEL[row.status]}</span>
                </header>
                <div className="supplemental-merge-values">
                  <div><small>기존 정보</small><p>{rowText(row.existing?.answer)}{row.existing?.explanation ? ` · ${row.existing.explanation}` : ""}</p></div>
                  <div><small>새 정보</small><p>{rowText(row.incoming?.answer)}{row.incoming?.explanation ? ` · ${row.incoming.explanation}` : ""}</p></div>
                </div>
                {row.status === "conflict" && (
                  <label>
                    처리
                    <select
                      value={resolution?.fieldChoices && Object.values(resolution.fieldChoices)[0] === "incoming" ? "incoming" : "existing"}
                      onChange={(event) => updateResolution(row.key, { fieldChoices: Object.fromEntries(conflictFields.map((field) => [field, event.target.value])) as AnswerMergeResolution["fieldChoices"] })}
                      disabled={saving}
                    >
                      <option value="existing">기존 값 유지</option>
                      <option value="incoming">새 값 적용</option>
                    </select>
                  </label>
                )}
                {row.status === "unmatched" && (
                  <div className="supplemental-merge-actions">
                    <label><input type="checkbox" checked={resolution?.excluded ?? true} onChange={(event) => updateResolution(row.key, { excluded: event.target.checked })} disabled={saving} /> 이 항목 제외</label>
                    <input aria-label={`${row.questionNumber}번 연결 번호`} placeholder="기존 문항 번호" value={resolution?.targetQuestionNumber ?? ""} onChange={(event) => updateResolution(row.key, { targetQuestionNumber: event.target.value, excluded: false })} disabled={saving} />
                  </div>
                )}
                {row.status === "duplicate" && (
                  <label><input type="radio" name={`duplicate-${row.questionNumber}`} checked={Boolean(resolution?.useDuplicate)} onChange={() => {
                    setResolutions((current) => current.map((item) => item.key === row.key ? { ...item, useDuplicate: true, excluded: false } : analysis.rows.find((candidate) => candidate.status === "duplicate" && candidate.questionNumber === row.questionNumber)?.key === item.key ? { ...item, useDuplicate: false, excluded: true } : item));
                  }} disabled={saving} /> 이 자료를 사용</label>
                )}
              </article>
            );
          })}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="form-footer">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>취소</button>
        <button type="button" className="btn-primary" onClick={() => void save()} disabled={!canSave}>병합 저장</button>
      </div>
    </Dialog>
  );
}
