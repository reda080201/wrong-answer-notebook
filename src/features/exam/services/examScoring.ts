import type { ExamQuestionSnapshot, ExamResponse, ExamSession, ExamSessionScore } from "../../../types";

const CIRCLED_NUMBERS: Record<string, string> = {
  "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5",
  "⑥": "6", "⑦": "7", "⑧": "8", "⑨": "9", "⑩": "10",
};

export function normalizeExamAnswer(value: string | undefined | null): string {
  const compact = String(value ?? "")
    .trim()
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, (token) => CIRCLED_NUMBERS[token] ?? token)
    .replace(/\s+/g, "")
    .replace(/[()]/g, "")
    .replace(/번/g, "")
    .replace(/\.$/, "");
  if (!/^[0-9,]+$/.test(compact)) return compact;
  return compact
    .split(",")
    .filter(Boolean)
    .map((token) => String(Number(token)))
    .sort((left, right) => Number(left) - Number(right))
    .join(",");
}

export function scoreExamSession(session: ExamSession, scoredAt = new Date()): ExamSessionScore {
  const responses = new Map(session.responses.map((item) => [item.questionNumber, item]));
  const questionResults = session.questions.map((question) => {
    const response = responses.get(question.questionNumber);
    const value = normalizeExamAnswer(response?.response);
    const answer = normalizeExamAnswer(question.correctAnswer);
    const correct = Boolean(value && answer && value === answer);
    return { questionNumber: question.questionNumber, correct, hasResponse: Boolean(value), markedForReview: Boolean(response?.markedForReview) };
  });
  const answeredCount = questionResults.filter((item) => item.hasResponse).length;
  const correctCount = questionResults.filter((item) => item.correct).length;
  return {
    totalQuestions: questionResults.length,
    answeredCount,
    correctCount,
    markedForReviewCount: questionResults.filter((item) => item.markedForReview).length,
    percentCorrect: questionResults.length ? Math.round((correctCount / questionResults.length) * 100) : 0,
    questionResults,
    scoredAt: scoredAt.toISOString(),
  };
}

export function scoreExamResponses(questions: ExamQuestionSnapshot[], responses: ExamResponse[]): ExamSessionScore {
  return scoreExamSession({ id: "", entryId: "", title: "", subject: "", status: "in_progress", questions, responses, currentQuestionIndex: 0, startedAt: "", updatedAt: "" });
}
