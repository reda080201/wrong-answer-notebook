import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { ExamSession, GeneratedExam } from "../types";
import { useGeneratedExams } from "./useGeneratedExams";
import { useSavedRealExamProtection } from "./useSavedRealExamProtection";
import { assertRealExamSourcesAllowed, getRealExamProtection, setActiveRealExamProtection, setSavedRealExamProtection } from "../features/exam/services/realExamProtection";
import { requestStudyAi } from "../features/study-ai/api";

const { loadGeneratedExams } = vi.hoisted(() => ({ loadGeneratedExams: vi.fn() }));
vi.mock("../api", () => ({
  loadGeneratedExams,
  saveGeneratedExams: vi.fn(),
  errorMessage: (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback,
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: vi.fn(), Channel: class {} }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}
const sessions = [{ id: "session", entryId: "generated:legacy", title: "실전", mode: "real", status: "in_progress", questions: [{ id: "q", questionNumber: "1" }] }] as ExamSession[];
const exams = [{ id: "legacy", questions: [{ position: 1, source: { sourceEntryId: "original", sourceQuestionNumber: "7" } }] }] as GeneratedExam[];
const entries: [] = [];
const requestOriginal = () => requestStudyAi({ context: "[{\"question\":\"private\"}]", images: [], sourceEntryIds: ["original"], messages: [{ role: "user", text: "설명" }] }, new AbortController().signal);
const reloadSessions = vi.fn<() => Promise<boolean>>();
const maintenance = vi.fn();
async function runMaintenanceOperation<T>(task: () => Promise<T>): Promise<T> {
  maintenance();
  return task();
}

function useBoundary(props = { sessionLoading: false, sessionLoadError: null as string | null }) {
  const generated = useGeneratedExams();
  const recovery = useSavedRealExamProtection({
    sessions, ...props, entries, exams: generated.exams,
    generatedLoading: generated.loading, generatedLoadError: generated.loadError,
    reloadSessions, reloadGenerated: generated.reload, runMaintenanceOperation,
  });
  return { generated, recovery };
}
beforeEach(() => {
  loadGeneratedExams.mockResolvedValue(exams);
  reloadSessions.mockResolvedValue(true);
  vi.mocked(invoke).mockResolvedValue("free chat");
});
afterEach(() => {
  cleanup(); setActiveRealExamProtection(null); setSavedRealExamProtection([]); vi.resetAllMocks();
});

it("blocks the actual request boundary while provenance loads, but still permits material-free chat", async () => {
  const pending = deferred<GeneratedExam[]>();
  loadGeneratedExams.mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useBoundary());
  await expect(requestOriginal()).rejects.toThrow("출처");
  expect(invoke).not.toHaveBeenCalled();
  await expect(requestStudyAi({ context: "[]", images: [], messages: [{ role: "user", text: "안녕" }] }, new AbortController().signal)).resolves.toBe("free chat");
  await act(async () => { pending.resolve(exams); });
  await waitFor(() => expect(result.current.generated.loading).toBe(false));
  expect(getRealExamProtection().unavailable).toBe(false);
  expect(() => assertRealExamSourcesAllowed(["unrelated"])).not.toThrow();
  await expect(requestOriginal()).rejects.toThrow("제출 후");
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("retries both stores once and stays closed until both have finished", async () => {
  const generated = deferred<GeneratedExam[]>(), saved = deferred<boolean>();
  loadGeneratedExams.mockRejectedValueOnce(new Error("generated read failed")).mockReturnValueOnce(generated.promise);
  reloadSessions.mockReturnValueOnce(saved.promise);
  const { result } = renderHook(() => useBoundary());
  await waitFor(() => expect(result.current.generated.loadError).toBe("generated read failed"));
  await expect(requestOriginal()).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  let retry!: Promise<boolean>;
  await act(async () => {
    retry = result.current.recovery.retry();
    expect(await result.current.recovery.retry()).toBe(false);
  });
  expect(maintenance).toHaveBeenCalledTimes(1);
  expect(reloadSessions).toHaveBeenCalledTimes(1);
  expect(loadGeneratedExams).toHaveBeenCalledTimes(2);
  await act(async () => { generated.resolve(exams); });
  expect(getRealExamProtection().unavailable).toBe(true);
  await act(async () => { saved.resolve(true); expect(await retry).toBe(true); });
  expect(getRealExamProtection().unavailable).toBe(false);
  await expect(requestOriginal()).rejects.toThrow("제출 후");
  expect(invoke).not.toHaveBeenCalled();
});

it("handles rejection without releasing maintenance before the other read settles", async () => {
  const saved = deferred<boolean>();
  loadGeneratedExams.mockRejectedValue(new Error("generated unavailable"));
  reloadSessions.mockReturnValueOnce(saved.promise);
  const { result } = renderHook(() => useBoundary());
  await waitFor(() => expect(result.current.generated.loading).toBe(false));
  let settled = false;
  let retry!: Promise<boolean>;
  await act(async () => { retry = result.current.recovery.retry().then(value => { settled = true; return value; }); });
  expect(settled).toBe(false);
  expect(getRealExamProtection().unavailable).toBe(true);
  await act(async () => { saved.resolve(true); expect(await retry).toBe(false); });
  expect(result.current.recovery.retryError).toContain("모두 불러오지 못했습니다");
  await expect(requestOriginal()).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  loadGeneratedExams.mockResolvedValue(exams);
  await act(async () => { expect(await result.current.recovery.retry()).toBe(true); });
  expect(result.current.recovery.retryError).toBeNull();
  expect(getRealExamProtection().unavailable).toBe(false);
});

it.each(["loading", "error"])("keeps session %s closed even after generated sources are ready", async (phase) => {
  const { result, rerender } = renderHook(props => useBoundary(props), {
    initialProps: { sessionLoading: phase === "loading", sessionLoadError: phase === "error" ? "session read failed" : null },
  });
  await waitFor(() => expect(result.current.generated.loading).toBe(false));
  expect(getRealExamProtection().unavailable).toBe(true);
  await expect(requestOriginal()).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  rerender({ sessionLoading: false, sessionLoadError: null });
  expect(getRealExamProtection().unavailable).toBe(false);
});

it("does not publish late recovery completion after unmount", async () => {
  const saved = deferred<boolean>();
  loadGeneratedExams.mockRejectedValueOnce(new Error("read failed"));
  reloadSessions.mockReturnValueOnce(saved.promise);
  const { result, unmount } = renderHook(() => useBoundary());
  await waitFor(() => expect(result.current.generated.loading).toBe(false));
  let retry!: Promise<boolean>;
  await act(async () => { retry = result.current.recovery.retry(); });
  unmount();
  await act(async () => { saved.resolve(true); await retry; });
  expect(getRealExamProtection().sessions).toEqual([]);
  expect(getRealExamProtection().unavailable).toBe(false);
});

it("does not trust a previously loaded mapping while generated records reload or fail", async () => {
  const { result } = renderHook(() => useBoundary());
  await waitFor(() => expect(result.current.generated.loading).toBe(false));
  expect(getRealExamProtection().unavailable).toBe(false);
  const pending = deferred<GeneratedExam[]>();
  loadGeneratedExams.mockReturnValueOnce(pending.promise);
  let reload!: Promise<boolean>;
  await act(async () => { reload = result.current.generated.reload(); });
  expect(getRealExamProtection().unavailable).toBe(true);
  // This ID is not in the old mapping; the store's readiness must also gate requests.
  await expect(requestStudyAi({ context: "[{}]", images: [], sourceEntryIds: ["new-original"], messages: [{ role: "user", text: "질문" }] }, new AbortController().signal)).rejects.toThrow("출처");
  await act(async () => { pending.reject(new Error("reload failed")); expect(await reload).toBe(false); });
  expect(result.current.generated.exams).toEqual(exams);
  expect(getRealExamProtection().unavailable).toBe(true);
  expect(invoke).not.toHaveBeenCalled();
  loadGeneratedExams.mockResolvedValue(exams);
  await act(async () => { expect(await result.current.recovery.retry()).toBe(true); });
  expect(getRealExamProtection().unavailable).toBe(false);
});
