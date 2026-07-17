import type { ExamQuestionSnapshot, ExamResponse, ExamSession, ExamSessionScore } from "../../../types";

export function scoreExamSession(session: ExamSession, scoredAt = new Date()): ExamSessionScore {
  const responses = new Map(session.responses.map((item) => [item.questionNumber, item]));
  const questionResults = session.questions.map((question) => {
    const response = responses.get(question.questionNumber);
    const value = response?.response.trim() ?? "";
    const correct = Boolean(value && question.correctAnswer && value === question.correctAnswer);
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
