import { describe, expect, it, vi } from "vitest";
import type { PendingDeletion, WrongAnswerEntry } from "../types";
import { finalizePendingDeletionRecords, getProtectedPendingImageReferences } from "./usePendingDeletionCoordinator";

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
  });
});
