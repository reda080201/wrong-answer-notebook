import { v4 as uuidv4 } from "uuid";
import type { ExamQuestionSnapshot, ExamResponse, ExamSession, QuestionContentSegment, WrongAnswerEntry } from "../../../types";
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
    const figures = entry.figures?.filter((figure) => normalizeQuestionNumber(figure.questionNumber) === normalizedNumber) ?? [];
    return {
      id: `${entry.id}-${number}`,
      questionNumber: number,
      passage: stimulus?.text,
      stimulusGroupId: stimulus?.id,
      question: stripTrailingStimulus(entry.question, block, stimuli),
      choices: (block.choices ?? []).map((choice) => `${choice.marker} ${choice.text}`),
      questionImages: [],
      sourcePageImages: entry.questionImages ?? [],
      figures,
      contentSegments: resolveContentSegments(entry, normalizedNumber, block, figures),
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

function resolveContentSegments(
  entry: WrongAnswerEntry,
  questionNumber: string,
  block: QuestionBlock,
  figures: ExamQuestionSnapshot["figures"],
): QuestionContentSegment[] | undefined {
  const stored = entry.questionContentSegments?.[questionNumber];
  if (stored?.length) return stored;
  const segments: QuestionContentSegment[] = [];
  for (const [index, body] of block.bodySegments.entries()) {
    const id = `body-${index + 1}`;
    const figureToken = body.text.match(/^\s*\[FIGURE:([^\]]+)\]\s*$/i);
    if (figureToken?.[1]) {
      segments.push({ id, type: "figure", figureId: figureToken[1].trim() });
    } else {
      segments.push(body.kind === "condition"
        ? { id, type: "condition", label: body.label, text: body.text }
        : { id, type: "text", text: body.text });
    }
  }
  const placed = figures
    .filter((figure) => figure.placement?.afterSegmentId)
    .sort((a, b) => (a.placement?.order ?? 0) - (b.placement?.order ?? 0));
  for (const figure of placed) {
    const after = figure.placement?.afterSegmentId;
    const index = segments.findIndex((segment) => segment.id === after);
    if (index >= 0 && !segments.some((segment) => segment.type === "figure" && segment.figureId === figure.id)) {
      segments.splice(index + 1, 0, { id: `figure-${figure.id}`, type: "figure", figureId: figure.id });
    }
  }
  return segments.length ? segments : undefined;
}

interface StimulusRange {
  id: string;
  start: number;
  end: number;
  text: string;
}

function findStimuli(text: string, questions: QuestionBlock[]): StimulusRange[] {
  const markers = getExplicitStimulusStarts(text).filter((start) => isNextGroupStimulusMarker(start, text, questions));
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


function isNextGroupStimulusMarker(start: number, text: string, questions: QuestionBlock[]): boolean {
  const previous = questions.filter((question) => question.start < start).at(-1);
  if (!previous) return true;

  const blockEnd = getQuestionContentEnd(text, previous, questions);
  if (start <= blockEnd) return false;

  const nextQuestion = questions.find((question) => question.start > previous.start);
  if (nextQuestion && start >= nextQuestion.start) return false;

  if (start >= previous.end) return true;
  return hasBlankLineBefore(text, start);
}

function hasBlankLineBefore(text: string, start: number): boolean {
  return /(?:\r\n|\n|\r)[ \t]*(?:\r\n|\n|\r)[ \t]*$/.test(text.slice(0, start));
}

function getQuestionContentEnd(text: string, previous: QuestionBlock, questions: QuestionBlock[]): number {
  if (previous.choices.length > 0) {
    return previous.choices.at(-1)!.end;
  }

  const nextQuestion = questions.find((question) => question.start > previous.start);
  const scanEnd = nextQuestion?.start ?? text.length;
  const lines = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  lines.lastIndex = previous.bodyStart;

  let lastContentEnd = previous.bodyEnd;
  let match: RegExpExecArray | null;
  while ((match = lines.exec(text)) !== null) {
    if (!match[0] && match.index === text.length) break;
    if (match.index >= scanEnd) break;

    const line = match[0].replace(/\r\n|\n|\r$/, "");
    const lineEnd = match.index + line.length;
    const trimmed = line.trim();

    if (isExplicitStimulusLine(trimmed)) {
      return lastContentEnd;
    }
    if (trimmed) {
      lastContentEnd = lineEnd;
    }
    if (lines.lastIndex >= scanEnd || lines.lastIndex === text.length) break;
  }

  return lastContentEnd;
}

function getExplicitStimulusStarts(text: string): number[] {
  const starts: number[] = [];
  const lines = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;
  while ((match = lines.exec(text)) !== null) {
    if (!match[0] && match.index === text.length) break;
    const line = match[0].replace(/\r\n|\n|\r$/, "").trim();
    if (isExplicitStimulusLine(line)) starts.push(match.index);
    if (lines.lastIndex === text.length) break;
  }
  return starts;
}

function isExplicitStimulusLine(line: string): boolean {
  const bracketedPassage = /^(?:\[\s*(?:자료|제시문|지문|도표|그래프|그림)(?:\s*[A-Za-z가-힣0-9]+)?\s*\]|<\s*(?:자료|제시문|지문|도표|그래프|그림)(?:\s*[A-Za-z가-힣0-9]+)?\s*>)$/;
  if (bracketedPassage.test(line)) return true;
  const bracketedTable = /^(?:\[\s*표(?:\s*[A-Za-z가-힣0-9]+)?\s*\]|<\s*표(?:\s*[A-Za-z가-힣0-9]+)?\s*>)$/;
  if (bracketedTable.test(line)) return true;
  if (/^표\s*(?::|：)\s*$/.test(line)) return true;
  return /^표\s+\d+\b/.test(line);
}

function stripTrailingStimulus(text: string, block: QuestionBlock, stimuli: StimulusRange[]): string {
  const trailing = stimuli.find((item) => item.start >= block.bodyStart && item.start < block.end);
  const end = trailing ? trailing.start : block.bodyEnd;
  return text.slice(block.bodyStart, end).trim();
}
