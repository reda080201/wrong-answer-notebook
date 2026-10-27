import type { AnswerProvenance, AssessmentEvidence, StudyAssessment } from "../models/studyAssessment";
import type { SheetAnswerItem } from "../types";
import { validateStudyAssessment } from "../features/import/vision/visionSchema";

export function normalizeStoredAssessment(raw: unknown): StudyAssessment | undefined {
  if (raw === undefined) return undefined;
  validateStudyAssessment(raw); return structuredClone(raw);
}

export function normalizeAssessmentEvidence(raw: unknown): AssessmentEvidence | undefined {
  if (raw === undefined) return undefined;
  const value = raw as AssessmentEvidence;
  const hashes = (list: unknown) => Array.isArray(list) && list.length <= 1000 && list.every(hash => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash));
  if (!value || value.provider !== "openai" || typeof value.independent !== "boolean" || typeof value.model !== "string" || !value.model.startsWith("gpt-") || !Array.isArray(value.requestIds) || value.requestIds.length > 1000 || !value.requestIds.every(id => typeof id === "string" && id.length < 256) || !hashes(value.responseHashes) || !hashes(value.sourceHashes) || !Number.isFinite(Date.parse(value.completedAt))) throw new Error("평가 실행 기록이 잘못되었습니다.");
  return structuredClone(value);
}

export function normalizeAnswerProvenance(raw: unknown, stored = false): AnswerProvenance | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("정답 출처 형식이 잘못되었습니다.");
  const value = raw as Partial<AnswerProvenance>;
  if (!["gpt_estimate", "source", "conflict", "user_confirmed"].includes(value.kind ?? "")) throw new Error("정답 출처 형식이 잘못되었습니다.");
  const confirmed = stored && value.kind === "user_confirmed" && typeof value.confirmedAt === "string" && Number.isFinite(Date.parse(value.confirmedAt));
  return {
    kind: value.kind === "user_confirmed" ? confirmed ? "user_confirmed" : "gpt_estimate" : value.kind!,
    proposedAnswer: typeof value.proposedAnswer === "string" ? value.proposedAnswer : null,
    independent: stored && value.independent === true,
    ...(confirmed ? { confirmedAt: value.confirmedAt } : {}),
  };
}

export function isAnswerReadyForGrading(answer: Pick<SheetAnswerItem, "answer" | "answerProvenance"> | undefined): boolean {
  if (!answer?.answer?.trim()) return false;
  const provenance = answer.answerProvenance;
  return !provenance || provenance.kind === "source" || provenance.kind === "user_confirmed" && typeof provenance.confirmedAt === "string" && Number.isFinite(Date.parse(provenance.confirmedAt));
}

export function confirmAssessmentAnswer(answer: SheetAnswerItem, now = new Date().toISOString()): SheetAnswerItem {
  if (!answer.answer?.trim()) throw new Error("확인할 정답을 먼저 입력하세요.");
  return { ...answer, needsReview: false, processingStatus: "ready", sourceNote: `사용자가 정답을 확인했습니다. · ${now}${answer.sourceNote?.match(/ · 원본 자료 \d+페이지$/)?.[0] ?? ""}`, answerProvenance: { kind: "user_confirmed", proposedAnswer: answer.answerProvenance?.proposedAnswer ?? null, independent: answer.answerProvenance?.independent ?? false, confirmedAt: now } };
}
