import type { ExamMode, ExamSession } from "../../../types";

type DateInput = Date | string;

export function normalizeExamMode(session: Pick<ExamSession, "mode">): ExamMode {
  return session.mode === "real" ? "real" : "practice";
}

export function createRealExamTiming(startedAt: DateInput, minutes: number): string {
  const start = toTimestamp(startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(minutes) || minutes < 0) {
    throw new RangeError("Real exam timing requires a valid start time and non-negative duration.");
  }
  return new Date(start + minutes * 60_000).toISOString();
}

export function getRemainingExamSeconds(deadlineAt: DateInput, now: DateInput = new Date()): number {
  const remainingMilliseconds = toTimestamp(deadlineAt) - toTimestamp(now);
  if (!Number.isFinite(remainingMilliseconds)) return 0;
  return Math.max(0, Math.ceil(remainingMilliseconds / 1_000));
}

export function isExamExpired(session: Pick<ExamSession, "mode" | "deadlineAt">, now: DateInput = new Date()): boolean {
  return normalizeExamMode(session) === "real"
    && session.deadlineAt !== undefined
    && getRemainingExamSeconds(session.deadlineAt, now) === 0;
}

export function findResumableExamSession(
  sessions: ExamSession[],
  entryId: string,
  mode: ExamMode,
): ExamSession | undefined {
  return sessions.find((session) => (
    session.entryId === entryId
    && session.status === "in_progress"
    && normalizeExamMode(session) === mode
  ));
}

function toTimestamp(value: DateInput): number {
  return typeof value === "string" ? new Date(value).getTime() : value.getTime();
}
