import type { WrongAnswerEntry } from "../types";

export type NextStudyActionId =
  | "review-text"
  | "review-missing"
  | "review-rejected-notes"
  | "generate-solution"
  | "generate-learning"
  | "start-focus"
  | "show-answer"
  | "next-question"
  | "record-good"
  | "make-visualization";

export interface NextStudyActionState {
  isSheet: boolean;
  hasNextQuestion: boolean;
  hideAnswers: boolean;
  focusModeClosed: boolean;
  canGenerateSolution: boolean;
  canGenerateLearning: boolean;
  hasSuspiciousText?: boolean;
  theaterModeClosed?: boolean;
}

export interface NextStudyActionResult {
  id: NextStudyActionId;
  label: string;
}

function hasDiagram(entry: WrongAnswerEntry): boolean {
  return Boolean(
    entry.learningBlocks?.some((block) => block.diagramSpec || block.diagramType) ||
      entry.answerKey?.some((answer) => answer.diagramSpec || answer.diagramType),
  );
}

function hasMathConcept(entry: WrongAnswerEntry): boolean {
  const text = [
    entry.subject,
    entry.question,
    ...(entry.answerKey ?? []).flatMap((answer) => [
      ...(answer.concepts ?? []),
      answer.strategy ?? "",
      answer.explanation,
    ]),
  ].join(" ");
  return /수학|함수|그래프|미분|적분|확률|기하|수열|방정식|부등식|삼각|좌표/.test(text);
}

export function getNextStudyAction(
  entry: WrongAnswerEntry,
  state: NextStudyActionState,
): NextStudyActionResult {
  if (state.hasSuspiciousText) {
    return { id: "review-text", label: "텍스트 검수하기" };
  }
  if ((entry.importAudit?.missingQuestionNumbers.length ?? 0) > 0) {
    return { id: "review-missing", label: "누락 검토하기" };
  }
  if ((entry.rejectedNotes?.length ?? 0) > 0) {
    return { id: "review-rejected-notes", label: "제외 필기 확인" };
  }
  if (state.canGenerateSolution && !(entry.answerKey?.length ?? 0) && !entry.correctAnswer.trim()) {
    return { id: "generate-solution", label: "GPT 해설 만들기" };
  }
  if (state.canGenerateLearning && (entry.answerKey?.length ?? 0) > 0 && !(entry.learningBlocks?.length ?? 0)) {
    return { id: "generate-learning", label: "특강 만들기" };
  }
  if (state.focusModeClosed || state.theaterModeClosed) {
    return { id: "start-focus", label: "크게 보기" };
  }
  if (state.hideAnswers) {
    return { id: "show-answer", label: "정답 보기" };
  }
  if (state.isSheet && state.hasNextQuestion) {
    return { id: "next-question", label: "다음 문제" };
  }
  if (!hasDiagram(entry) && hasMathConcept(entry)) {
    return { id: "make-visualization", label: "시각화 만들기" };
  }
  return { id: "record-good", label: "맞음으로 기록" };
}
