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
  return <div className="form-footer">
    <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>취소</button>
    {!commitLocked && !solutionMode && !supplementalMode && onOpenWorkspace && <button type="button" className="btn-secondary" disabled={!canApply || saving} onClick={onOpenWorkspace}>작업실에서 검토</button>}
    {!solutionMode && !supplementalMode && onQuickSave && <button type="button" className="btn-primary" disabled={!canApply || saving} onClick={onQuickSave}>{saving ? "저장 중..." : commitLocked ? "저장 결과 확인·정리 재시도" : "바로 저장"}</button>}
    <button type="button" className="btn-secondary" disabled={commitLocked || !canApply || saving} onClick={onApply}>{saving ? "저장 중..." : solutionMode ? "해설 적용하기" : "수정 후 저장"}</button>
  </div>;
}
