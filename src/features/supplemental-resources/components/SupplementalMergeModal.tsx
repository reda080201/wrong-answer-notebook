import { useMemo, useState } from "react";
import type { EntryFormData, WrongAnswerEntry } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";
import {
  analyzeAnswerMerge,
  getAnswerMergeResolutionIssues,
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
  cleanupError?: string | null;
  cleanupBusy?: boolean;
  onRetryCleanup?: () => void;
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

const FIELD_LABEL: Record<string, string> = {
  answer: "정답",
  explanation: "풀이",
  strategy: "풀이 전략",
  steps: "풀이 단계",
  choiceJudgements: "보기별 판단",
  wrongPoint: "오답 포인트",
  reviewPoint: "복습 포인트",
  notes: "메모",
  mistakeAnalysis: "실수 분석",
  importantPoints: "중요 포인트",
  difficulty: "난이도",
  difficultyScore: "난이도 점수",
  concepts: "개념",
  diagramType: "도형 유형",
  diagramSpec: "도형 구조",
  needsReview: "검토 필요",
  sourceNote: "출처 메모",
};

function rowText(value: unknown): string {
  if (value === undefined || value === null) return "없음";
  if (typeof value === "string") return value || "없음";
  return JSON.stringify(value);
}

export default function SupplementalMergeModal({ target, imported, mode, assetFiles, assetSession, onClose, cleanupError, cleanupBusy = false, onRetryCleanup, onSave }: SupplementalMergeModalProps) {
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
  const resolutionIssues = getAnswerMergeResolutionIssues(target, analysis, resolutions);
  const canSave = resolutionIssues.length === 0 && !saving && !cleanupBusy;

  const save = async () => {
    if (!canSave) {
      setError(resolutionIssues[0] ?? "병합 항목을 확인한 뒤 저장할 수 있습니다.");
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
    <Dialog open onClose={onClose} className="form-modal form-modal--wide supplemental-merge-modal" ariaLabel="추가 자료 병합 검토" closeDisabled={saving || cleanupBusy} busy={saving || cleanupBusy}>
      <div className="form-header">
        <div>
          <h2>추가 자료 병합 검토</h2>
          <p>{target.title} · {target.subject}</p>
        </div>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="병합 검토 닫기" disabled={saving || cleanupBusy}>닫기</button>
      </div>
      <div className="form-body">
        <label className="form-field">
          자료 제목
          <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving} />
        </label>
        <p className="muted">기존 정답·해설은 기본적으로 유지됩니다. 충돌 행에서 새 값을 선택한 경우에만 해당 필드를 바꿉니다.</p>
        {analysis.blockingIssues.length > 0 && <div className="app-error-banner" role="alert">{analysis.blockingIssues.join(" ")}</div>}
        {resolutionIssues.length > 0 && <div className="app-error-banner" role="alert">{resolutionIssues.join(" ")}</div>}
        <div className="supplemental-merge-table" role="table" aria-label="답안 병합 비교">
          {analysis.rows.length === 0 && <p className="list-empty">문항별 답안은 없으며 추가 이미지·해설 자료만 연결됩니다.</p>}
          {analysis.rows.map((row) => {
            const resolution = resolutionFor(row.key);
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
                  <div className="supplemental-merge-conflicts" aria-label={`${row.questionNumber}번 필드별 충돌 처리`}>
                    {row.fieldConflicts.map((conflict) => (
                      <label key={conflict.field}>
                        <span>{FIELD_LABEL[conflict.field] ?? conflict.field}</span>
                        <small>기존: {rowText(conflict.existing)} / 새 값: {rowText(conflict.incoming)}</small>
                        <select
                          value={resolution?.fieldChoices?.[conflict.field] ?? "existing"}
                          onChange={(event) => updateResolution(row.key, {
                            fieldChoices: {
                              ...resolution?.fieldChoices,
                              [conflict.field]: event.target.value as "existing" | "incoming",
                            },
                          })}
                          disabled={saving}
                        >
                          <option value="existing">기존 값 유지</option>
                          <option value="incoming">새 값 적용</option>
                        </select>
                      </label>
                    ))}
                  </div>
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
        {cleanupError && (
          <div className="app-error-banner" role="alert">
            <p>{cleanupError}</p>
            {onRetryCleanup && <button type="button" className="btn-secondary" onClick={onRetryCleanup} disabled={cleanupBusy}>임시 자산 정리 다시 시도</button>}
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="form-footer">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving || cleanupBusy}>취소</button>
        <button type="button" className="btn-primary" onClick={() => void save()} disabled={!canSave}>병합 저장</button>
      </div>
    </Dialog>
  );
}
