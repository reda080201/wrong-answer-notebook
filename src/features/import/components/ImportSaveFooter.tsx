interface ImportSaveFooterProps {
  solutionMode: boolean;
  supplementalMode: boolean;
  canApply: boolean;
  saving: boolean;
  onClose(): void;
  onQuickSave?(): void;
  onApply(): void;
}

export default function ImportSaveFooter({ solutionMode, supplementalMode, canApply, saving, onClose, onQuickSave, onApply }: ImportSaveFooterProps) {
  return <div className="form-footer">
    <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>취소</button>
    {!solutionMode && !supplementalMode && onQuickSave && <button type="button" className="btn-primary" disabled={!canApply || saving} onClick={onQuickSave}>{saving ? "저장 중..." : "바로 저장"}</button>}
    <button type="button" className="btn-secondary" disabled={!canApply || saving} onClick={onApply}>{saving ? "저장 중..." : solutionMode ? "해설 적용하기" : "수정 후 저장"}</button>
  </div>;
}
