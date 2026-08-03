import { AppError } from "./appError";
import { writeStorageJson } from "./storageJson";

export function writeUiStorageValue(key: string, value: string, onError?: (error: AppError) => void): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (cause) {
    const error = cause instanceof AppError
      ? cause
      : new AppError("ui_storage_write_failed", "화면 설정을 저장하지 못했습니다. 현재 세션에서는 계속 사용할 수 있습니다.", { retryable: false, cause });
    onError?.(error);
    if (!onError) console.warn(error.message);
    return false;
  }
}

export function writeUiStorageJson(key: string, value: unknown, onError?: (error: AppError) => void): boolean {
  try {
    writeStorageJson(localStorage, key, value);
    return true;
  } catch (cause) {
    const error = cause instanceof AppError
      ? cause
      : new AppError("ui_storage_write_failed", "화면 설정을 저장하지 못했습니다. 현재 세션에서는 계속 사용할 수 있습니다.", { retryable: false, cause });
    onError?.(error);
    if (!onError) console.warn(error.message);
    return false;
  }
}
