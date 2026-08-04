import { useEffect, useState } from "react";
import type { GeneratedExam } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";
import GeneratedExamList from "./GeneratedExamList";

interface GeneratedExamsDialogProps {
  open: boolean;
  closing: boolean;
  closeError: string | null;
  loading: boolean;
  loadError: string | null;
  saving: boolean;
  saveError: string | null;
  hasRetryableChange: boolean;
  exams: GeneratedExam[];
  onClose(): Promise<void>;
  onReload(): Promise<void>;
  onRetry(): Promise<void>;
  onDiscardFailure(): void;
  onOpen(exam: GeneratedExam): void;
  onDelete(id: string): Promise<void>;
  onPrint(exam: GeneratedExam): Promise<void>;
}

export default function GeneratedExamsDialog(props: GeneratedExamsDialogProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [failedAction, setFailedAction] = useState<{ action: () => Promise<void>; fallback: string } | null>(null);
  useEffect(() => {
    if (!props.open) return;
    setActionError(null);
    setActionBusy(false);
    setFailedAction(null);
  }, [props.open]);
  const runAction = async (action: () => Promise<void>, fallback: string) => {
    if (actionBusy) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await action();
      setFailedAction(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : fallback);
      setFailedAction({ action, fallback });
    } finally {
      setActionBusy(false);
    }
  };
  const actionDisabled = props.loading || Boolean(props.loadError) || actionBusy;

  return (
    <Dialog
      open={props.open}
      onClose={() => void props.onClose()}
      closeDisabled={props.closing || actionBusy}
      busy={props.closing || actionBusy}
      className="modal-card generated-exams-modal"
      ariaLabel="내 모의고사"
    >
      <button
        type="button"
        className="btn-icon generated-exams-modal__close"
        aria-label="내 모의고사 닫기"
        onClick={() => void props.onClose()}
        disabled={props.closing || actionBusy}
      >
        ✕
      </button>
      {props.loading && <p className="form-hint" role="status">모의고사를 불러오는 중...</p>}
      {props.loadError && (
        <div className="form-error" role="alert">
          {props.loadError}
          <button type="button" className="btn-secondary" onClick={() => void props.onReload()}>다시 불러오기</button>
        </div>
      )}
      {props.saving && <p className="form-hint" role="status">저장 중...</p>}
      {props.saveError && (
        <div className="form-error" role="alert">
          {props.saveError}
          {props.hasRetryableChange && (
            <>
              <button type="button" className="btn-secondary" onClick={() => void props.onRetry()}>실패한 변경 다시 저장</button>
              <button type="button" className="btn-secondary" onClick={props.onDiscardFailure}>변경 취소</button>
            </>
          )}
        </div>
      )}
      {props.closeError && (
        <div className="form-error" role="alert">
          {props.closeError}
          <button type="button" className="btn-secondary" onClick={() => void props.onClose()} disabled={props.closing}>다시 저장 후 닫기</button>
        </div>
      )}
      {actionError && <div className="form-error" role="alert">{actionError}{failedAction && <button type="button" className="btn-secondary" onClick={() => void runAction(failedAction.action, failedAction.fallback)} disabled={actionBusy}>다시 시도</button>}</div>}
      <GeneratedExamList
        exams={props.exams}
        onOpen={props.onOpen}
        onDelete={(id) => void runAction(() => props.onDelete(id), "모의고사를 삭제하지 못했습니다.")}
        onPrint={(exam) => void runAction(() => props.onPrint(exam), "모의고사를 출력하지 못했습니다.")}
        disabled={actionDisabled}
      />
    </Dialog>
  );
}
