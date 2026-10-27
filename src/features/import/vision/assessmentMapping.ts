import { normalizeExamAnswer } from "../../exam/services/examScoring";
import type { VisionQuestion } from "./visionSchema";
import type { QuestionMeta, SheetAnswerItem } from "../../../types";

/** External model declarations are always imported. Host evidence is resolved separately. */
export function mapVisionAssessment(question: VisionQuestion, id: string, now: string, sourcePage?: number): { meta?: QuestionMeta; answer?: SheetAnswerItem } {
  const a = question.studyAssessment;
  if (!a) return {};
  const source = a.sourceAnswer;
  const hasSource = ["matched", "conflict", "source_only"].includes(source.status);
  const conflict = source.status === "conflict" || Boolean(hasSource && a.solution.proposedAnswer && normalizeExamAnswer(source.value) !== normalizeExamAnswer(a.solution.proposedAnswer));
  const answer = hasSource ? source.value ?? "" : a.solution.proposedAnswer ?? "";
  const needsReview = conflict || !hasSource || a.assessmentStatus !== "solved" || a.warnings.length > 0;
  return {
    meta: {
      questionNumber: question.questionNumber ?? "", important: (a.scores.importance.value ?? 0) >= 80,
      difficultyScore: a.scores.difficulty.value ?? undefined, needsReview, updatedAt: now,
      rating: { importanceScore: a.scores.importance.value ?? undefined, evaluationSource: "imported", lastEvaluatedAt: now },
      classification: { ...a.classification, difficultySource: "imported" }, studyAssessment: structuredClone(a),
    },
    answer: {
      id, questionNumber: question.questionNumber ?? "", answer,
      explanation: source.explanation?.trim() ? source.explanation : a.solution.summary, strategy: a.solution.strategy, steps: a.solution.steps,
      ...(source.intent ? { intent: source.intent } : {}),
      ...(source.notes ? { notes: source.notes } : {}),
      ...(source.choiceJudgements ? { choiceJudgements: structuredClone(source.choiceJudgements) } : {}),
      importantPoints: a.learning.importantPoints, wrongPoint: a.learning.commonTraps.join("\n"), reviewPoint: a.learning.reviewPoint,
      concepts: a.classification.concepts, needsReview, processingStatus: needsReview ? "needs_review" : "ready",
      sourceNote: (conflict ? "원문 답안과 AI 예상 답이 다릅니다. 정답을 확인하세요." : hasSource ? "연결된 원문 답안" : "AI 예상 답 · 확인 전 자동 채점 제외") + (sourcePage ? ` · 원본 자료 ${sourcePage}페이지` : ""),
      answerProvenance: { kind: conflict ? "conflict" : hasSource ? "source" : "gpt_estimate", proposedAnswer: a.solution.proposedAnswer, independent: false },
    },
  };
}
