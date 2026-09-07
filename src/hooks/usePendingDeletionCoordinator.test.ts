import { describe, expect, it } from "vitest";
import type { PendingDeletion, WrongAnswerEntry } from "../types";
import { getProtectedPendingImageReferences } from "./usePendingDeletionCoordinator";

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
});
