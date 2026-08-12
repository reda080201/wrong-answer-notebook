import type { ExamSession } from "../../../types";
import { describe, expect, it } from "vitest";
import {
  createRealExamTiming,
  findResumableExamSession,
  getRemainingExamSeconds,
  isExamExpired,
  normalizeExamMode,
} from "./realExam";

const start = "2026-01-01T00:00:00.000Z";

function session(overrides: Partial<ExamSession> = {}): ExamSession {
  return {
    id: "session-1",
    entryId: "entry-1",
    title: "시험",
    subject: "수학",
    status: "in_progress",
    questions: [
      { id: "q-9", questionNumber: "9", question: "문제", choices: [], questionImages: [], figures: [] },
      { id: "q-20", questionNumber: "20", question: "문제", choices: [], questionImages: [], figures: [] },
    ],
    responses: [],
    currentQuestionIndex: 0,
    startedAt: start,
    updatedAt: start,
    ...overrides,
  };
}

describe("real exam helpers", () => {
  it("normalizes legacy sessions to practice", () => {
    expect(normalizeExamMode(session())).toBe("practice");
    expect(normalizeExamMode(session({ mode: "real" }))).toBe("real");
  });

  it("creates an absolute real exam deadline", () => {
    expect(createRealExamTiming(start, 90)).toBe("2026-01-01T01:30:00.000Z");
  });

  it("keeps timer semantics stable across reloads", () => {
    const deadline = createRealExamTiming(start, 10);
    expect(getRemainingExamSeconds(deadline, "2026-01-01T00:04:59.500Z")).toBe(301);
    expect(getRemainingExamSeconds(deadline, "2026-01-01T00:05:00.000Z")).toBe(300);
  });

  it("detects real exam expiry but leaves practice sessions untimed", () => {
    const deadlineAt = createRealExamTiming(start, 10);
    expect(isExamExpired(session({ mode: "real", deadlineAt }), "2026-01-01T00:10:00.000Z")).toBe(true);
    expect(isExamExpired(session({ deadlineAt }), "2026-01-01T00:10:00.000Z")).toBe(false);
    expect(isExamExpired(session(), "2099-01-01T00:00:00.000Z")).toBe(false);
  });

  it("resumes only an in-progress session with the requested mode", () => {
    const practice = session({ id: "practice" });
    const real = session({ id: "real", mode: "real" });
    const submitted = session({ id: "submitted", status: "submitted" });
    const sessions = [practice, real, submitted];

    expect(findResumableExamSession(sessions, "entry-1", "real")).toBe(real);
    expect(findResumableExamSession(sessions, "entry-1", "practice")).toBe(practice);
    expect(findResumableExamSession(sessions, "missing", "practice")).toBeUndefined();
    expect(findResumableExamSession([session({ questions: [] })], "entry-1", "practice")?.questions).toEqual([]);
  });
});
