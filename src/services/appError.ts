export type AppErrorCode =
  | "storage_read_failed"
  | "storage_write_failed"
  | "storage_quota_exceeded"
  | "ui_storage_write_failed"
  | "invalid_stored_data"
  | "unknown";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.retryable = options.retryable ?? true;
    this.cause = options.cause;
  }
}

export function toAppError(
  error: unknown,
  fallback: string,
  options: { code?: AppErrorCode; retryable?: boolean } = {},
): AppError {
  if (error instanceof AppError) return error;
  const detail = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";
  return new AppError(
    options.code ?? "unknown",
    detail.trim() ? `${fallback} (${detail})` : fallback,
    { retryable: options.retryable, cause: error },
  );
}
