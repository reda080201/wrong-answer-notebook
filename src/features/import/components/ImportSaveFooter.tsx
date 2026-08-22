interface ImportSaveFooterProps {
  solutionMode: boolean;
  supplementalMode: boolean;
  canApply: boolean;
  quickSaving: boolean;
  onClose(): void;
  onQuickSave?(): void;
  onApply(): void;
}

export default function ImportSaveFooter({ solutionMode, supplementalMode, canApply, quickSaving, onClose, onQuickSave, onApply }: ImportSaveFooterProps) {
  return <div className="form-footer">
    <button type="button" className="btn-secondary" onClick={onClose}>취소</button>
    {!solutionMode && !supplementalMode && onQuickSave && <button type="button" className="btn-primary" disabled={!canApply || quickSaving} onClick={onQuickSave}>{quickSaving ? "저장 중..." : "바로 저장"}</button>}
    <button type="button" className="btn-secondary" disabled={!canApply || quickSaving} onClick={onApply}>{solutionMode ? "해설 적용하기" : "수정 후 저장"}</button>
  </div>;
}
