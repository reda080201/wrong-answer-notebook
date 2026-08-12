import { afterEach, describe, expect, it } from "vitest";
import type { ExamSession } from "../../../types";
import {
  EXAM_SESSIONS_STORAGE_KEY,
  loadExamSessions,
  mergeExamSession,
  saveExamSessions,
} from "./examSessionStorage";

const sampleSession = (id: string, entryId = "entry-1"): ExamSession => ({
  id,
  entryId,
  title: "모의고사",
  subject: "수학",
  status: "in_progress",
  questions: [],
  responses: [],
  currentQuestionIndex: 0,
  startedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mode: "practice",
});

describe("examSessionStorage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips exam sessions through localStorage", () => {
    const sessions = [sampleSession("s1"), sampleSession("s2", "entry-2")];
    saveExamSessions(sessions);
    expect(loadExamSessions()).toEqual(sessions);
    expect(localStorage.getItem(EXAM_SESSIONS_STORAGE_KEY)).toBe(JSON.stringify(sessions));
  });

  it("returns an empty list when missing and rejects invalid storage payloads", () => {
    expect(loadExamSessions()).toEqual([]);
    localStorage.setItem(EXAM_SESSIONS_STORAGE_KEY, "not-json");
    expect(() => loadExamSessions()).toThrow("저장된 데이터를 읽을 수 없습니다");
    localStorage.setItem(EXAM_SESSIONS_STORAGE_KEY, JSON.stringify({ sessions: [] }));
    expect(() => loadExamSessions()).toThrow("저장된 데이터 형식이 올바르지 않습니다");
  });

  it("replaces an existing session by id when merging", () => {
    const original = sampleSession("s1");
    const updated = { ...original, updatedAt: "2026-01-02T00:00:00.000Z", currentQuestionIndex: 3 };
    const merged = mergeExamSession([original, sampleSession("s2")], updated);
    expect(merged).toHaveLength(2);
    expect(merged.find((item) => item.id === "s1")).toEqual(updated);
    expect(merged.find((item) => item.id === "s2")).toEqual(sampleSession("s2"));
  });
});
