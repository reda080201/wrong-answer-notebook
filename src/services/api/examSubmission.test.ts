import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamSession, WrongAnswerEntry } from "../../types";

const { invoke, isTauri } = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri }));

import { commitExamSubmission, reconcileBrowserExamSubmissionJournal } from "./examSubmission";
import { ENTRIES_STORAGE_KEY } from "./shared";
import { EXAM_SESSIONS_STORAGE_KEY } from "../../features/exam/storage/examSessionStorage";

const session: ExamSession = {
  id: "session-1", entryId: "sheet-1", title: "시험", subject: "수학", status: "submitted",
  questions: [], responses: [], currentQuestionIndex: 0, startedAt: "a", updatedAt: "b", submittedAt: "c",
};

function entry(id: string, questionNumber: string): WrongAnswerEntry {
  return {
    id, subject: "수학", title: "오답", question: "문제", questionImages: [], entryKind: "wrong_answer",
    difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "", explanationParts: [], memo: "",
    annotations: [], tags: [], answerKey: [], figures: [], mastered: false, createdAt: "a", updatedAt: "b",
    generatedFromExamSessionId: "session-1", generatedFromQuestionNumber: questionNumber,
  };
}

describe("exam submission transaction adapter", () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    isTauri.mockReturnValue(false);
  });

  it("persists a browser submission together and deduplicates provenance", async () => {
    localStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, entries: [entry("old", "01")] }));
    localStorage.setItem(EXAM_SESSIONS_STORAGE_KEY, "[]");

    const result = await commitExamSubmission({ submittedSession: session, derivedEntries: [entry("duplicate", "1번"), entry("new", "2")] });

    expect(result.addedEntryIds).toEqual(["new"]);
    expect(result.entries.map((item) => item.id)).toEqual(["new", "old"]);
    expect(result.sessions).toEqual([session]);
    expect(localStorage.getItem("wrong-answer-exam-submission-journal")).toBeNull();
  });

  it("rolls a pending browser journal forward before loading either document", () => {
    const entries = JSON.stringify({ schemaVersion: 2, entries: [entry("new", "1")] });
    const sessions = JSON.stringify([session]);
    localStorage.setItem("wrong-answer-exam-submission-journal", JSON.stringify({
      version: 1, beforeEntries: null, beforeSessions: null, afterEntries: entries, afterSessions: sessions,
    }));

    reconcileBrowserExamSubmissionJournal();

    expect(localStorage.getItem(ENTRIES_STORAGE_KEY)).toBe(entries);
    expect(localStorage.getItem(EXAM_SESSIONS_STORAGE_KEY)).toBe(sessions);
    expect(localStorage.getItem("wrong-answer-exam-submission-journal")).toBeNull();
  });

  it("uses one typed Tauri command and returns its authoritative result", async () => {
    isTauri.mockReturnValue(true);
    invoke.mockResolvedValue({ entries: [entry("new", "1")], sessions: [session], addedEntryIds: ["new"] });

    await expect(commitExamSubmission({ submittedSession: session, derivedEntries: [entry("new", "1")] }))
      .resolves.toMatchObject({ addedEntryIds: ["new"] });
    expect(invoke).toHaveBeenCalledWith("submit_exam_transaction", {
      input: { submittedSession: session, derivedEntries: [entry("new", "1")] },
    });
  });
});
