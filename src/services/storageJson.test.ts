import { describe, expect, it } from "vitest";
import { AppError } from "./appError";
import { readStorageJson, writeStorageJson } from "./storageJson";

describe("storageJson", () => {
  it("does not replace an existing value when browser storage is full", () => {
    const storage = {
      getItem: (key: string) => key === "value" ? '{"kept":true}' : null,
      setItem: () => { throw new DOMException("full", "QuotaExceededError"); },
    } as unknown as Storage;

    expect(() => writeStorageJson(storage, "value", { next: true }))
      .toThrow("브라우저 저장 공간이 부족합니다");
    expect(readStorageJson(storage, "value", (value): value is { kept: boolean } =>
      value !== null && typeof value === "object" && "kept" in value,
    )).toEqual({ kept: true });
  });

  it("reports malformed JSON as a non-retryable stored-data error", () => {
    const storage = { getItem: () => "not-json" } as unknown as Storage;
    try {
      readStorageJson(storage, "value", Array.isArray);
      throw new Error("expected read to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("invalid_stored_data");
      expect((error as AppError).retryable).toBe(false);
    }
  });
});
