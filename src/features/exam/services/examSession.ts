import { v4 as uuidv4 } from "uuid";
import type { ExamQuestionSnapshot, ExamResponse, ExamSession, WrongAnswerEntry } from "../../../types";
import { parseQuestionText } from "../../../utils/textLayout";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export function createExamSession(entry: WrongAnswerEntry, now = new Date()): ExamSession {
  const blocks = parseQuestionText(entry.question);
  const questions: ExamQuestionSnapshot[] = blocks.filter((block) => block.kind === "question").map((block, index) => {
    if (block.kind !== "question") throw new Error("question block expected");
    const number = String(block.numberLabel ?? block.displayNumber ?? index + 1);
    const normalizedNumber = normalizeQuestionNumber(number);
    const answer = entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === normalizedNumber);
    return {
      id: `${entry.id}-${number}`,
      questionNumber: number,
      passage: undefined,
      question: block.body,
      choices: (block.choices ?? []).map((choice) => `${choice.marker} ${choice.text}`),
      questionImages: entry.questionImages ?? [],
      figures: entry.figures?.filter((figure) => normalizeQuestionNumber(figure.questionNumber) === normalizedNumber) ?? [],
      correctAnswer: answer?.answer,
      explanation: answer?.explanation,
    };
  });
  return {
    id: uuidv4(),
    entryId: entry.id,
    title: entry.title,
    subject: entry.subject,
    status: "in_progress",
    questions,
    responses: [],
    currentQuestionIndex: 0,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function updateExamResponse(session: ExamSession, response: ExamResponse, now = new Date()): ExamSession {
  const responses = session.responses.filter((item) => item.questionNumber !== response.questionNumber);
  return { ...session, responses: [...responses, response], updatedAt: now.toISOString() };
}

export function publicExamQuestion(session: ExamSession, index = session.currentQuestionIndex) {
  const question = session.questions[index];
  if (!question) return null;
  const response = session.responses.find((item) => item.questionNumber === question.questionNumber);
  return {
    sessionId: session.id,
    title: session.title,
    subject: session.subject,
    status: session.status,
    questionIndex: index,
    totalQuestions: session.questions.length,
    question: { ...question, correctAnswer: undefined, explanation: undefined },
    response: response?.response ?? "",
    scratchNote: response?.scratchNote ?? "",
    markedForReview: response?.markedForReview ?? false,
    submitted: session.status === "submitted",
    answerAvailable: session.status === "submitted",
  };
}
