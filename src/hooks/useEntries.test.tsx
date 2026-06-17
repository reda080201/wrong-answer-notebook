import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntryFormData, WrongAnswerEntry } from "../types";

vi.mock("../api", () => ({
  deleteImage: vi.fn(),
  errorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? `${fallback} (${error.message})` : fallback,
  loadEntries: vi.fn(),
  saveEntries: vi.fn(),
}));

import { deleteImage, loadEntries, saveEntries } from "../api";
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
    vi.mocked(loadEntries).mockReset();
    vi.mocked(saveEntries).mockReset();
    vi.mocked(loadEntries).mockResolvedValue([entry]);
    vi.mocked(saveEntries).mockResolvedValue(undefined);
    vi.mocked(deleteImage).mockResolvedValue(undefined);
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
});
