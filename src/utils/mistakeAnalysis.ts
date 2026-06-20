import type {
  MistakeAnalysis,
  MistakeCauseSeverity,
  MistakeCauseType,
  ReviewStrategy,
  WrongAnswerEntry,
} from "../types";

export const MISTAKE_CAUSE_OPTIONS: Array<{ type: MistakeCauseType; label: string }> = [
  { type: "calculation", label: "계산 실수" },
  { type: "condition_misread", label: "조건 해석 실패" },
  { type: "concept_gap", label: "개념 누락" },
  { type: "strategy_gap", label: "발상 실패" },
  { type: "time_pressure", label: "시간 압박" },
  { type: "choice_trap", label: "보기 판단 오류" },
  { type: "careless", label: "부주의" },
  { type: "unknown", label: "미분류" },
];

export const PRACTICE_MODE_LABELS: Record<ReviewStrategy, string> = {
  concept_review: "개념노트 재확인",
  drill: "짧은 반복 훈련",
  similar_problem: "유사문제 풀이",
  timed_retry: "시간 제한 재풀이",
  choice_review: "보기 판단 훈련",
  solution_pattern_review: "풀이 발상 복습",
};

const CAUSE_LABELS = new Map(MISTAKE_CAUSE_OPTIONS.map((item) => [item.type, item.label]));

export function isMistakeCauseType(value: unknown): value is MistakeCauseType {
  return (
    value === "calculation" ||
    value === "condition_misread" ||
    value === "concept_gap" ||
    value === "strategy_gap" ||
    value === "time_pressure" ||
    value === "choice_trap" ||
    value === "careless" ||
    value === "unknown"
  );
}

export function isReviewStrategy(value: unknown): value is ReviewStrategy {
  return (
    value === "concept_review" ||
    value === "drill" ||
    value === "similar_problem" ||
    value === "timed_retry" ||
    value === "choice_review" ||
    value === "solution_pattern_review"
  );
}

function normalizeSeverity(value: unknown): MistakeCauseSeverity {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

export function mistakeCauseLabel(type: MistakeCauseType): string {
  return CAUSE_LABELS.get(type) ?? "미분류";
}

export function recommendedStrategyForCause(type: MistakeCauseType): ReviewStrategy {
  if (type === "concept_gap") return "concept_review";
  if (type === "calculation" || type === "careless") return "drill";
  if (type === "condition_misread" || type === "choice_trap") return "choice_review";
  if (type === "time_pressure") return "timed_retry";
  if (type === "strategy_gap") return "solution_pattern_review";
  return "similar_problem";
}

export function recommendedStrategyForAnalysis(analysis: MistakeAnalysis | undefined): ReviewStrategy | undefined {
  if (!analysis?.causes.length) return undefined;
  if (analysis.practiceMode) return analysis.practiceMode;
  const primary = analysis.primaryCause ?? analysis.causes[0]?.type;
  return primary ? recommendedStrategyForCause(primary) : undefined;
}

export function normalizeMistakeAnalysis(raw: unknown): MistakeAnalysis {
  if (!raw || typeof raw !== "object") {
    return { causes: [] };
  }
  const value = raw as Partial<MistakeAnalysis> & { causes?: unknown };
  const rawCauses: unknown[] = Array.isArray(value.causes) ? value.causes : [];
  const causes = rawCauses
        .filter((cause): cause is Record<string, unknown> => Boolean(cause && typeof cause === "object"))
        .map((cause) => {
          const type = isMistakeCauseType(cause.type) ? cause.type : "unknown";
          return {
            type,
            label: typeof cause.label === "string" && cause.label.trim() ? cause.label.trim() : mistakeCauseLabel(type),
            severity: normalizeSeverity(cause.severity),
            note: typeof cause.note === "string" ? cause.note.trim() : "",
          };
        })
        .filter((cause, index, list) => list.findIndex((item) => item.type === cause.type) === index)
    ;
  const primaryCause = isMistakeCauseType(value.primaryCause) ? value.primaryCause : causes[0]?.type;
  return {
    causes,
    primaryCause,
    confidence:
      value.confidence === "user" || value.confidence === "gpt" || value.confidence === "inferred"
        ? value.confidence
        : undefined,
    preventionNote: typeof value.preventionNote === "string" ? value.preventionNote.trim() : "",
    practiceMode: isReviewStrategy(value.practiceMode)
      ? value.practiceMode
      : primaryCause
        ? recommendedStrategyForCause(primaryCause)
        : undefined,
  };
}

export function summarizeMistakeAnalysis(entry: WrongAnswerEntry): string {
  const analysis = entry.mistakeAnalysis;
  if (!analysis?.causes.length) return "오답 원인 미분류";
  const causes = analysis.causes.map((cause) => mistakeCauseLabel(cause.type)).join(", ");
  const strategy = recommendedStrategyForAnalysis(analysis);
  return strategy ? `${causes} · ${PRACTICE_MODE_LABELS[strategy]}` : causes;
}
