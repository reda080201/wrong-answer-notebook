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

  it("does not persist a failed upsert through a later queued mutation", async () => {
    const first = { ...exam, id: "exam-a", title: "A" };
    const second = { ...exam, id: "exam-b", title: "B" };
    saveGeneratedExams.mockRejectedValueOnce(new Error("A 실패")).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useGeneratedExams());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstTask!: Promise<void>;
    let secondTask!: Promise<void>;
    await act(async () => {
      firstTask = result.current.upsert(first);
      secondTask = result.current.upsert(second);
      await expect(firstTask).rejects.toThrow("A 실패");
      await secondTask;
    });

    expect(saveGeneratedExams).toHaveBeenNthCalledWith(1, [exam, first]);
    expect(saveGeneratedExams).toHaveBeenNthCalledWith(2, [exam, second]);
    expect(result.current.exams.map((item) => item.id)).toEqual(["exam-1", "exam-b"]);
  });

  it("keeps a prior successful mutation visible when a later mutation fails", async () => {
    const first = { ...exam, id: "exam-a", title: "A" };
    saveGeneratedExams.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("B 실패"));
    const { result } = renderHook(() => useGeneratedExams());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const firstTask = result.current.upsert(first);
    const secondTask = result.current.remove("exam-1");
    await act(async () => {
      await firstTask;
      await expect(secondTask).rejects.toThrow("B 실패");
    });

    expect(result.current.exams.map((item) => item.id)).toEqual(["exam-1", "exam-a"]);
  });

  it("does not allow a mutation before the initial load has completed", async () => {
    let resolveLoad!: (value: GeneratedExam[]) => void;
    loadGeneratedExams.mockReturnValueOnce(new Promise<GeneratedExam[]>((resolve) => { resolveLoad = resolve; }));
    const { result } = renderHook(() => useGeneratedExams());

    await act(async () => {
      await expect(result.current.remove("exam-1")).rejects.toThrow("불러오는 중");
    });
    resolveLoad([exam]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.exams).toEqual([exam]);
    expect(saveGeneratedExams).not.toHaveBeenCalled();
  });

  it("does not save an empty list after load failure and reloads only once", async () => {
    let resolveReload!: (value: GeneratedExam[]) => void;
    loadGeneratedExams
      .mockRejectedValueOnce(new Error("permission denied"))
      .mockReturnValueOnce(new Promise<GeneratedExam[]>((resolve) => { resolveReload = resolve; }));
    const { result } = renderHook(() => useGeneratedExams());
    await waitFor(() => expect(result.current.loadError).toContain("permission denied"));

    await act(async () => {
      await expect(result.current.remove("exam-1")).rejects.toThrow("permission denied");
    });
    expect(saveGeneratedExams).not.toHaveBeenCalled();

    let first!: Promise<boolean>;
    await act(async () => {
      first = result.current.reload();
      await result.current.reload();
    });
    resolveReload([exam]);
    await act(async () => { await first; });
    expect(loadGeneratedExams).toHaveBeenCalledTimes(2);
    expect(result.current.exams).toEqual([exam]);
  });

  it("treats a valid JSON object payload as a load failure", async () => {
    loadGeneratedExams.mockResolvedValueOnce({} as never);
    const { result } = renderHook(() => useGeneratedExams());

    await waitFor(() => expect(result.current.loadError).toContain("배열이어야 합니다"));
    await act(async () => {
      await expect(result.current.remove("exam-1")).rejects.toThrow("배열이어야 합니다");
    });
    expect(saveGeneratedExams).not.toHaveBeenCalled();
  });
});
