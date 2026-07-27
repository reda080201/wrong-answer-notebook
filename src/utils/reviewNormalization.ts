import { v4 as uuidv4 } from "uuid";
import type { ReviewEvent, ReviewPhase, ReviewState } from "../types";
import { isMistakeCauseType, isReviewStrategy } from "./mistakeAnalysis";

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

export function isReviewResult(value: unknown): value is "again" | "hard" | "good" {
  return value === "again" || value === "hard" || value === "good";
}

export interface ReviewNormalizationOptions {
  defaultPhase: ReviewPhase;
}

export function normalizeReviewState(
  raw: unknown,
  options: ReviewNormalizationOptions,
): ReviewState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<ReviewState>;
  const historySource = Array.isArray(value.history) ? value.history : [];
  const history: ReviewEvent[] = historySource
    .filter((event) => Boolean(event && typeof event === "object"))
    .map((event) => event as Partial<ReviewEvent>)
    .map((event) => ({
      id: event.id || uuidv4(),
      reviewedAt: isValidIsoDate(event.reviewedAt) ? event.reviewedAt : new Date().toISOString(),
      result: isReviewResult(event.result) ? event.result : "again",
      nextDueAt: event.nextDueAt === null || isValidIsoDate(event.nextDueAt) ? event.nextDueAt : null,
      intervalDays: typeof event.intervalDays === "number" && event.intervalDays >= 0 ? event.intervalDays : 1,
      causeSnapshot: Array.isArray(event.causeSnapshot)
        ? event.causeSnapshot.filter(isMistakeCauseType)
        : undefined,
      strategy: isReviewStrategy(event.strategy) ? event.strategy : undefined,
      stabilityDays: typeof event.stabilityDays === "number" && event.stabilityDays > 0 ? event.stabilityDays : undefined,
      memoryDifficulty:
        typeof event.memoryDifficulty === "number" && event.memoryDifficulty >= 1
          ? Math.min(10, event.memoryDifficulty)
          : undefined,
      lapseCount: typeof event.lapseCount === "number" && event.lapseCount >= 0 ? Math.floor(event.lapseCount) : undefined,
    }));

  return {
    dueAt: value.dueAt === null || isValidIsoDate(value.dueAt) ? value.dueAt : null,
    lastReviewedAt: isValidIsoDate(value.lastReviewedAt) ? value.lastReviewedAt : undefined,
    intervalDays: typeof value.intervalDays === "number" && value.intervalDays >= 0 ? value.intervalDays : 0,
    streak: typeof value.streak === "number" && value.streak >= 0 ? Math.floor(value.streak) : 0,
    history,
    stabilityDays:
      typeof value.stabilityDays === "number" && value.stabilityDays > 0
        ? value.stabilityDays
        : Math.max(0.5, typeof value.intervalDays === "number" ? value.intervalDays : 0),
    memoryDifficulty:
      typeof value.memoryDifficulty === "number" && value.memoryDifficulty >= 1
        ? Math.min(10, value.memoryDifficulty)
        : 5,
    lapseCount:
      typeof value.lapseCount === "number" && value.lapseCount >= 0
        ? Math.floor(value.lapseCount)
        : history.filter((event) => event.result === "again").length,
    preLapseStabilityDays:
      typeof value.preLapseStabilityDays === "number" && value.preLapseStabilityDays > 0
        ? value.preLapseStabilityDays
        : undefined,
    relearningStep: value.relearningStep === 0 || value.relearningStep === 1 ? value.relearningStep : undefined,
    repetitionCount:
      typeof value.repetitionCount === "number" && value.repetitionCount >= 0
        ? Math.floor(value.repetitionCount)
        : history.length,
    phase:
      value.phase === "learning" || value.phase === "relearning" || value.phase === "long_term" || value.phase === "archived"
        ? value.phase
        : options.defaultPhase,
  };
}
