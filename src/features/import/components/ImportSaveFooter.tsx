interface ImportSaveFooterProps {
  solutionMode: boolean;
  supplementalMode: boolean;
  canApply: boolean;
  saving: boolean;
  commitLocked?: boolean;
  onClose(): void;
  onQuickSave?(): void;
  onOpenWorkspace?(): void;
  onApply(): void;
}

export default function ImportSaveFooter({ solutionMode, supplementalMode, canApply, saving, commitLocked = false, onClose, onQuickSave, onOpenWorkspace, onApply }: ImportSaveFooterProps) {
  const workroom = !solutionMode && !supplementalMode && Boolean(onOpenWorkspace);
  const primaryAction = workroom ? onOpenWorkspace : onApply;
  return <div className="form-footer">
    <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>{commitLocked ? "기록 보존하고 닫기" : "취소"}</button>
    {!commitLocked && !solutionMode && !supplementalMode && <details className="import-save-more"><summary>다른 저장 방법</summary><div>
      {onQuickSave && <button type="button" className="btn-secondary" disabled={!canApply || saving} onClick={onQuickSave}>바로 저장</button>}
      {workroom && <button type="button" className="btn-secondary" disabled={!canApply || saving} onClick={onApply}>이 화면의 수정 내용 저장</button>}
    </div></details>}
    {!commitLocked && <button type="button" data-testid="import-primary-action" className="btn-primary" disabled={!canApply || saving} onClick={primaryAction}>{saving ? "저장 중…" : solutionMode ? "해설 적용하기" : workroom ? "검토하기" : "자료 저장"}</button>}
  </div>;
}
