import type { ProblemSourceInfo, ProblemSourceType } from "../types";

const SOURCE_TYPES = new Set<ProblemSourceType>([
  "past_exam", "mock_exam", "n_series", "worksheet", "textbook",
  "ebs", "school_exam", "self_made", "ai_generated", "unknown",
]);

export const PROBLEM_SOURCE_LABELS: Record<ProblemSourceType, string> = {
  past_exam: "기출",
  mock_exam: "사설 모의고사",
  n_series: "N제",
  worksheet: "문제지·학습지",
  textbook: "교과서",
  ebs: "EBS",
  school_exam: "내신",
  self_made: "직접 제작",
  ai_generated: "AI 생성",
  unknown: "미분류",
};

export function normalizeProblemSourceType(value: unknown): ProblemSourceType {
  return typeof value === "string" && SOURCE_TYPES.has(value as ProblemSourceType)
    ? value as ProblemSourceType
    : "unknown";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function normalizeProblemSource(raw: unknown): ProblemSourceInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const type = normalizeProblemSourceType(value.type);
  const normalized: ProblemSourceInfo = {
    type,
    publisher: text(value.publisher),
    seriesName: text(value.seriesName),
    examName: text(value.examName),
    examYear: integer(value.examYear),
    examMonth: integer(value.examMonth),
    examRound: text(value.examRound),
    organization: text(value.organization),
    teacher: text(value.teacher),
    isOfficial: typeof value.isOfficial === "boolean" ? value.isOfficial : undefined,
    sourceLabel: text(value.sourceLabel),
  };
  return normalized;
}

export function resolveProblemSource(source?: ProblemSourceInfo): ProblemSourceInfo {
  return source ?? { type: "unknown" };
}
