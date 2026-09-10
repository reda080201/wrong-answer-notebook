import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingDeletion, WrongAnswerEntry } from "../types";
vi.mock("../services/storageBackend", () => ({ getStorageBackend: vi.fn() }));
import { finalizePendingDeletionRecords, getProtectedPendingImageReferences, getUndoablePendingDeletions, usePendingDeletionCoordinator } from "./usePendingDeletionCoordinator";
import { getStorageBackend } from "../services/storageBackend";

const entry = (id: string): WrongAnswerEntry => ({
  id,
  subject: "수학",
  title: id,
  question: "문제",
  questionImages: [],
  entryKind: "wrong_answer",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
});

const pending = (id: string, entryId: string, imageReferences: string[]): PendingDeletion => ({
  id,
  entry: entry(entryId),
  originalIndex: 0,
  imageReferences,
  requestedAt: "2026-01-01T00:00:00.000Z",
  finalizeAfter: "2026-01-01T00:00:01.000Z",
});

describe("pending deletion asset protection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("protects images referenced by another undoable snapshot", () => {
    const records = [
      pending("pending-a", "entry-a", ["shared.png", "a.png"]),
      pending("pending-b", "entry-b", ["shared.png", "b.png"]),
    ];

    expect(
      getProtectedPendingImageReferences(records, [], "pending-a"),
    ).toEqual(new Set(["shared.png", "b.png"]));
  });

  it("does not keep a snapshot alive after its entry has been restored", () => {
    const records = [pending("pending-a", "entry-a", ["restored.png"])];

    expect(
      getProtectedPendingImageReferences(records, [entry("entry-a")], "other"),
    ).toEqual(new Set());
  });

  it("deletes a shared asset once when all records expire in the same pass", async () => {
    const deleteAsset = vi.fn().mockResolvedValue(undefined);
    const result = await finalizePendingDeletionRecords(
      [
        pending("pending-a", "entry-a", ["shared.png", "a.png"]),
        pending("pending-b", "entry-b", ["shared.png", "b.png"]),
      ],
      [],
      deleteAsset,
      Date.parse("2026-01-01T00:01:00.000Z"),
    );

    expect(deleteAsset).toHaveBeenCalledTimes(3);
    expect(deleteAsset).toHaveBeenCalledWith("shared.png");
    expect(result.retained).toEqual([]);
    expect(result.logicallyFinalizedEntryIds).toEqual(["entry-a", "entry-b"]);
  });

  it("protects an unexpired record and live entry from cleanup", async () => {
    const deleteAsset = vi.fn().mockResolvedValue(undefined);
    const future = { ...pending("pending-b", "entry-b", ["shared.png"]), finalizeAfter: "2026-01-02T00:00:00.000Z" };
    const result = await finalizePendingDeletionRecords(
      [pending("pending-a", "entry-a", ["shared.png", "a.png"]), future],
      [],
      deleteAsset,
      Date.parse("2026-01-01T00:01:00.000Z"),
    );

    expect(deleteAsset).toHaveBeenCalledWith("a.png");
    expect(deleteAsset).not.toHaveBeenCalledWith("shared.png");
    expect(result.retained).toEqual([future]);

    deleteAsset.mockClear();
    const liveResult = await finalizePendingDeletionRecords(
      [pending("pending-a", "entry-a", ["shared.png"])],
      [entry("entry-a")],
      deleteAsset,
      Date.parse("2026-01-01T00:01:00.000Z"),
    );
    expect(deleteAsset).not.toHaveBeenCalled();
    expect(liveResult.retained).toEqual([]);
  });

  it("retains only failed assets for a retry pass", async () => {
    const deleteAsset = vi.fn(async (image: string) => {
      if (image === "shared.png") throw new Error("locked");
    });
    const result = await finalizePendingDeletionRecords(
      [
        pending("pending-a", "entry-a", ["shared.png", "a.png"]),
        pending("pending-b", "entry-b", ["shared.png", "b.png"]),
      ],
      [],
      deleteAsset,
      Date.parse("2026-01-01T00:01:00.000Z"),
    );

    expect(result.failedImages).toEqual(new Set(["shared.png"]));
    expect(result.retained).toEqual([
      expect.objectContaining({ id: "pending-a", imageReferences: ["shared.png"] }),
      expect.objectContaining({ id: "pending-b", imageReferences: ["shared.png"] }),
    ]);
    expect(result.logicallyFinalizedEntryIds).toEqual(["entry-a", "entry-b"]);
  });

  it("separates expired cleanup retries from the undoable queue", () => {
    const expiredRetry = { ...pending("retry", "entry-a", ["locked.png"]), cleanupRetry: true };
    const active = { ...pending("active", "entry-b", ["undo.png"]), finalizeAfter: "2026-01-01T00:02:00.000Z" };

    expect(getUndoablePendingDeletions([expiredRetry, active], Date.parse("2026-01-01T00:01:00.000Z"))).toEqual([active]);
    expect(getUndoablePendingDeletions([expiredRetry], Date.parse("2026-01-01T00:01:00.000Z"))).toEqual([]);
  });

  it("reports durable pending load readiness independently from an empty result", async () => {
    vi.mocked(getStorageBackend).mockReturnValue({
      loadPendingDeletions: vi.fn().mockResolvedValue([]),
      savePendingDeletions: vi.fn().mockResolvedValue(undefined),
    } as never);
    const { result } = renderHook(() => usePendingDeletionCoordinator({
      entries: [],
      restore: vi.fn().mockResolvedValue(undefined),
      setSelectedId: vi.fn(),
    }));
    await waitFor(() => expect(result.current.initialLoadStatus).toBe("ready"));
    expect(result.current.pending).toEqual([]);
  });

  it("keeps pending readiness unavailable when the durable load fails", async () => {
    vi.mocked(getStorageBackend).mockReturnValue({
      loadPendingDeletions: vi.fn().mockRejectedValue(new Error("offline")),
      savePendingDeletions: vi.fn(),
    } as never);
    const { result } = renderHook(() => usePendingDeletionCoordinator({
      entries: [],
      restore: vi.fn().mockResolvedValue(undefined),
      setSelectedId: vi.fn(),
    }));
    await waitFor(() => expect(result.current.initialLoadStatus).toBe("error"));
    expect(result.current.pending).toEqual([]);
  });
});
