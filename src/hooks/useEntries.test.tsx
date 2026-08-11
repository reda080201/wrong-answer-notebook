import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntryFormData, WrongAnswerEntry } from "../types";

vi.mock("../api", () => ({
  deleteImage: vi.fn(),
  commitExamSubmission: vi.fn(),
  commitImportAssetSessionEntries: vi.fn(),
  commitImportAssetSessionEntry: vi.fn(),
  errorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? `${fallback} (${error.message})` : fallback,
  loadEntries: vi.fn(),
  saveEntries: vi.fn(),
}));

import {
  commitExamSubmission,
  commitImportAssetSessionEntries,
  commitImportAssetSessionEntry,
  deleteImage,
  loadEntries,
  saveEntries,
} from "../api";
import { useEntries } from "./useEntries";

const entry: WrongAnswerEntry = {
  id: "entry-1",
  subject: "수학",
  title: "제목",
  question: "문제",
  questionImages: ["question.png"],
  entryKind: "wrong_answer",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [{ id: "part-1", text: "", images: ["exp.png"] }],
  memo: "",
  annotations: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

const form: EntryFormData = {
  subject: entry.subject,
  title: "수정",
  question: entry.question,
  questionImages: [],
  entryKind: entry.entryKind,
  difficult: entry.difficult,
  difficulty: entry.difficulty,
  myAnswer: entry.myAnswer,
  correctAnswer: entry.correctAnswer,
  explanationParts: [],
  memo: entry.memo,
  annotations: entry.annotations,
  tags: entry.tags,
  mastered: entry.mastered,
};

describe("useEntries", () => {
  beforeEach(() => {
    vi.mocked(deleteImage).mockReset();
    vi.mocked(commitExamSubmission).mockReset();
    vi.mocked(commitImportAssetSessionEntries).mockReset();
    vi.mocked(commitImportAssetSessionEntry).mockReset();
    vi.mocked(loadEntries).mockReset();
    vi.mocked(saveEntries).mockReset();
    vi.mocked(loadEntries).mockResolvedValue([entry]);
    vi.mocked(saveEntries).mockResolvedValue(undefined);
    vi.mocked(deleteImage).mockResolvedValue(undefined);
    vi.mocked(commitImportAssetSessionEntry).mockResolvedValue([]);
    vi.mocked(commitImportAssetSessionEntries).mockResolvedValue([]);
    vi.mocked(commitExamSubmission).mockResolvedValue({
      entries: [entry],
      sessions: [],
      addedEntryIds: [],
    });
  });

  it("does not delete removed images when saving an update fails", async () => {
    vi.mocked(saveEntries).mockRejectedValueOnce(new Error("disk full"));
    const { result } = renderHook(() => useEntries());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(() => result.current.updateEntry(entry.id, form, ["question.png"])),
    ).rejects.toThrow("항목을 수정하지 못했습니다.");

    expect(deleteImage).not.toHaveBeenCalled();
  });

  it("saves an updated entry before deleting removed images", async () => {
    const { result } = renderHook(() => useEntries());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.updateEntry(entry.id, form, ["question.png"]));

    expect(saveEntries).toHaveBeenCalledTimes(1);
    expect(deleteImage).toHaveBeenCalledWith("question.png");
    expect(vi.mocked(saveEntries).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteImage).mock.invocationCallOrder[0],
    );
  });

  it("saves the deletion before cleaning up attached images", async () => {
    const { result } = renderHook(() => useEntries());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.deleteEntry(entry.id));

    expect(saveEntries).toHaveBeenCalledWith([]);
    expect(deleteImage).toHaveBeenCalledWith("question.png");
    expect(deleteImage).toHaveBeenCalledWith("exp.png");
  });

  it("does not delete an image still referenced by another entry", async () => {
    const shared = { ...entry, id: "entry-2", title: "공유 이미지" };
    vi.mocked(loadEntries).mockResolvedValue([entry, shared]);
    const { result } = renderHook(() => useEntries());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.deleteEntry(entry.id));

    expect(deleteImage).not.toHaveBeenCalledWith("question.png");
    expect(deleteImage).not.toHaveBeenCalledWith("exp.png");
  });

  it("adds multiple entries with one atomic persist", async () => {
    const { result } = renderHook(() => useEntries());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ids: string[] = [];
    await act(async () => {
      ids = await result.current.addEntries([
        { ...form, title: "첫 번째", entryKind: "concept" },
        { ...form, title: "두 번째", entryKind: "lecture" },
      ]);
    });

    expect(ids).toHaveLength(2);
    expect(saveEntries).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(saveEntries).mock.calls[0][0];
    expect(saved.map((item) => item.title)).toEqual(["첫 번째", "두 번째", "제목"]);
  });

  it("adopts only the authoritative entry result from an exam submission transaction", async () => {
    vi.mocked(commitExamSubmission).mockResolvedValue({
      entries: [{ ...entry, id: "derived", title: "시험 오답" }],
      sessions: [],
      addedEntryIds: ["derived"],
    });
    const { result } = renderHook(() => useEntries());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const submittedSession = {
      id: "exam-1",
      entryId: entry.id,
      title: "시험",
      subject: entry.subject,
      status: "submitted" as const,
      questions: [],
      responses: [],
      currentQuestionIndex: 0,
      startedAt: "a",
      updatedAt: "b",
      submittedAt: "c",
    };
    await act(async () => {
      await result.current.commitExamSubmission(submittedSession, [
        { ...form, title: "파생 오답" },
      ]);
    });

    expect(commitExamSubmission).toHaveBeenCalledWith(expect.objectContaining({
      submittedSession,
      derivedEntries: [expect.objectContaining({ title: "파생 오답" })],
    }));
    expect(saveEntries).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([{ ...entry, id: "derived", title: "시험 오답" }]);
  });

  it("serializes rapid patches against the latest saved state", async () => {
    const resolvers: Array<() => void> = [];
    vi.mocked(saveEntries).mockImplementation(
      () => new Promise<void>((resolve) => resolvers.push(resolve)),
    );
    const { result } = renderHook(() => useEntries());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const first = result.current.patchEntry(entry.id, { memo: "빠른 메모" });
    await waitFor(() => expect(saveEntries).toHaveBeenCalledTimes(1));
    const second = result.current.patchEntry(entry.id, { difficult: true });
    resolvers[0]();
    await waitFor(() => expect(saveEntries).toHaveBeenCalledTimes(2));
    resolvers[1]();
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(vi.mocked(saveEntries).mock.calls[1][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: entry.id, memo: "빠른 메모", difficult: true }),
      ]),
    );
  });

  it("flushes an in-flight entry save", async () => {
    let resolveSave: (() => void) | undefined;
    vi.mocked(saveEntries).mockImplementation(
      () => new Promise<void>((resolve) => { resolveSave = resolve; }),
    );
    const { result } = renderHook(() => useEntries());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const update = result.current.patchEntry(entry.id, { memo: "종료 직전" });
    await waitFor(() => expect(saveEntries).toHaveBeenCalledTimes(1));
    let flushed = false;
    const flush = result.current.flushEntries().then(() => { flushed = true; });
    await Promise.resolve();
    expect(flushed).toBe(false);
    resolveSave?.();
    await act(async () => { await Promise.all([update, flush]); });
    expect(flushed).toBe(true);
  });

  it("commits a staged asset session and its entry patch without a separate entries write", async () => {
    const { result } = renderHook(() => useEntries());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.patchEntryWithImportAssetSession(
        entry.id,
        entry.updatedAt,
        "11111111-1111-4111-8111-111111111111",
        { memo: "staged 자료 병합" },
      );
    });

    expect(saveEntries).not.toHaveBeenCalled();
    expect(commitImportAssetSessionEntry).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      entry.id,
      entry.updatedAt,
      expect.objectContaining({ memo: "staged 자료 병합" }),
    );
    expect(result.current.entries[0]).toMatchObject({ memo: "staged 자료 병합" });
  });

  it("adds imported entries through the staged-asset transaction without a separate entries write", async () => {
    const { result } = renderHook(() => useEntries());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addEntriesWithImportAssetSession(
        "11111111-1111-4111-8111-111111111111",
        [{ ...form, title: "staged 가져오기" }],
      );
    });

    expect(saveEntries).not.toHaveBeenCalled();
    expect(commitImportAssetSessionEntries).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      [expect.objectContaining({ title: "staged 가져오기" })],
    );
    expect(result.current.entries[0]).toMatchObject({ title: "staged 가져오기" });
  });
});
