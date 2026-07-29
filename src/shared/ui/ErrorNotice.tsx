interface ErrorNoticeProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  busy?: boolean;
}

export default function ErrorNotice({ message, onRetry, onDismiss, busy = false }: ErrorNoticeProps) {
  return (
    <div className="app-error-banner" role="alert">
      <span>{message}</span>
      {(onRetry || onDismiss) && (
        <div className="app-error-actions">
          {onRetry && <button type="button" onClick={onRetry} disabled={busy}>다시 시도</button>}
          {onDismiss && <button type="button" onClick={onDismiss} disabled={busy} aria-label="오류 닫기">닫기</button>}
        </div>
      )}
    </div>
  );
}
