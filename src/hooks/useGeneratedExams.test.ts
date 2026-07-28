import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratedExam } from "../types";

const { loadGeneratedExams, saveGeneratedExams } = vi.hoisted(() => ({
  loadGeneratedExams: vi.fn(),
  saveGeneratedExams: vi.fn(),
}));

vi.mock("../api", () => ({
  errorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback,
  loadGeneratedExams,
  saveGeneratedExams,
}));

import { useGeneratedExams } from "./useGeneratedExams";

const exam = { id: "exam-1", title: "시험", questions: [] } as unknown as GeneratedExam;

describe("useGeneratedExams retry", () => {
  beforeEach(() => {
    loadGeneratedExams.mockReset();
    saveGeneratedExams.mockReset();
    loadGeneratedExams.mockResolvedValue([exam]);
  });

  it("retries the failed snapshot instead of the rolled-back visible state", async () => {
    saveGeneratedExams.mockRejectedValueOnce(new Error("저장 실패")).mockResolvedValue(undefined);
    const { result } = renderHook(() => useGeneratedExams());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.remove("exam-1")).rejects.toThrow("저장 실패");
    });
    expect(result.current.exams).toEqual([exam]);
    expect(result.current.hasRetryableChange).toBe(true);

    await act(async () => {
      await result.current.retry();
    });
    expect(saveGeneratedExams).toHaveBeenLastCalledWith([]);
    expect(result.current.exams).toEqual([]);
    expect(result.current.hasRetryableChange).toBe(false);
  });

  it("does not keep a discarded failure in the close flush", async () => {
    saveGeneratedExams.mockRejectedValueOnce(new Error("저장 실패"));
    const { result } = renderHook(() => useGeneratedExams());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.remove("exam-1")).rejects.toThrow("저장 실패");
    });
    await act(async () => { result.current.discardFailedChange(); });
    await expect(result.current.flush()).resolves.toBeUndefined();
    await waitFor(() => expect(result.current.hasRetryableChange).toBe(false));
  });
});
