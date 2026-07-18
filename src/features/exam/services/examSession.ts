import { v4 as uuidv4 } from "uuid";
import type { ExamQuestionSnapshot, ExamResponse, ExamSession, WrongAnswerEntry } from "../../../types";
import { parseQuestionText, type QuestionBlock } from "../../../utils/textLayout";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export function createExamSession(entry: WrongAnswerEntry, now = new Date()): ExamSession {
  const blocks = parseQuestionText(entry.question);
  const questions = blocks.filter((block): block is QuestionBlock => block.kind === "question");
  const stimuli = findStimuli(entry.question, questions);
  const snapshots: ExamQuestionSnapshot[] = questions.map((block, index) => {
    const number = String(block.numberLabel ?? block.displayNumber ?? index + 1);
    const normalizedNumber = normalizeQuestionNumber(number);
    const answer = entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === normalizedNumber);
    const stimulus = stimuli.filter((item) => item.start < block.start && item.end <= block.start).at(-1);
    return {
      id: `${entry.id}-${number}`,
      questionNumber: number,
      passage: stimulus?.text,
      stimulusGroupId: stimulus?.id,
      question: stripTrailingStimulus(entry.question, block, stimuli),
      choices: (block.choices ?? []).map((choice) => `${choice.marker} ${choice.text}`),
      questionImages: [],
      sourcePageImages: entry.questionImages ?? [],
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
    questions: snapshots,
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
    answerAvailable: false,
  };
}

interface StimulusRange {
  id: string;
  start: number;
  end: number;
  text: string;
}

function findStimuli(text: string, questions: QuestionBlock[]): StimulusRange[] {
  const markers = [...text.matchAll(/^\s*(?:\[\s*)?(?:자료|제시문|지문|도표|그래프|그림|표).*$/gim)]
    .map((match) => match.index ?? 0);
  return markers.map((start, index) => {
    const nextMarker = markers[index + 1] ?? text.length;
    const nextQuestion = questions.find((question) => question.start > start && question.start < nextMarker)?.start ?? nextMarker;
    return {
      id: `stimulus-${index + 1}`,
      start,
      end: nextQuestion,
      text: text.slice(start, nextQuestion).trim(),
    };
  }).filter((item) => item.text);
}

function stripTrailingStimulus(text: string, block: QuestionBlock, stimuli: StimulusRange[]): string {
  const trailing = stimuli.find((item) => item.start >= block.bodyStart && item.start < block.end);
  const end = trailing ? trailing.start : block.bodyEnd;
  return text.slice(block.bodyStart, end).trim();
}
