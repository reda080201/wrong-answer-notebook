import { AppError } from "./appError";

export type StorageValueGuard<T> = (value: unknown) => value is T;

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (
    error.name === "QuotaExceededError" || error.code === 22
  );
}

export function readStorageJson<T>(
  storage: Storage,
  key: string,
  guard: StorageValueGuard<T>,
): T | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!guard(value)) {
      throw new AppError(
        "invalid_stored_data",
        "저장된 데이터 형식이 올바르지 않습니다.",
        { retryable: false },
      );
    }
    return value;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("invalid_stored_data", "저장된 데이터를 읽을 수 없습니다.", {
      retryable: false,
      cause: error,
    });
  }
}

export function writeStorageJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (isQuotaError(error)) {
      throw new AppError(
        "storage_quota_exceeded",
        "브라우저 저장 공간이 부족합니다. 데스크톱 앱에서 저장하거나 데이터를 정리해 주세요.",
        { retryable: false, cause: error },
      );
    }
    throw new AppError("storage_write_failed", "브라우저 저장소에 데이터를 저장하지 못했습니다.", {
      cause: error,
    });
  }
}
