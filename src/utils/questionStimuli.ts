import type { WrongAnswerEntry } from "../types";
import { parseQuestionText, type QuestionBlock } from "./textLayout";
import { normalizeQuestionNumber } from "./questionNumber";

export interface EntryQuestionStimulus { id: string; text: string; start: number; end: number; }

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

/** Read-only grouping projection shared by entry readers and exam snapshots. */
export function resolveEntryQuestionStimuli(entry: Pick<WrongAnswerEntry, "question">): Map<string, EntryQuestionStimulus> {
  const questions = parseQuestionText(entry.question).filter((item): item is QuestionBlock => item.kind === "question");
  const stimuli = findStimuli(entry.question, questions);
  return new Map(questions.flatMap((question) => {
    const number = normalizeQuestionNumber(String(question.numberLabel ?? question.displayNumber));
    const stimulus = stimuli.filter((item) => item.start < question.start).at(-1);
    const unique = questions.filter(item => normalizeQuestionNumber(String(item.numberLabel ?? item.displayNumber)) === number).length === 1;
    return unique && number && stimulus ? [[number, { ...stimulus }] as const] : [];
  }));
}


function isNextGroupStimulusMarker(start: number, text: string, questions: QuestionBlock[]): boolean {
  const previous = questions.filter((question) => question.start < start).at(-1);
  if (!previous) return true;

  const contentEnd = getQuestionContentEnd(text, previous, questions);
  if (start < contentEnd) return false;
  return start >= previous.end || hasBlankLineBefore(text, start);
}

function hasBlankLineBefore(text: string, start: number): boolean {
  return /(?:\r\n|\n|\r)[ \t]*(?:\r\n|\n|\r)[ \t]*$/.test(text.slice(0, start));
}

function getQuestionContentEnd(text: string, previous: QuestionBlock, questions: QuestionBlock[]): number {
  if (previous.choices.length > 0) {
    const nextQuestion = questions.find((question) => question.start > previous.start);
    const marker = getExplicitStimulusStarts(text).find(
      (candidate) => candidate > previous.bodyStart && candidate < (nextQuestion?.start ?? text.length),
    );
    return marker ?? previous.choices.at(-1)!.end;
  }

  const nextQuestion = questions.find((question) => question.start > previous.start);
  const scanEnd = nextQuestion?.start ?? text.length;
  const lines = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  lines.lastIndex = previous.bodyStart;

  // Re-scan from the question body so a separated stimulus heading that was
  // included in the parser slice cannot extend the previous question.
  let lastContentEnd = previous.bodyStart;
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

/** Limit edits to the question itself; never consume a following shared passage. */
export function questionCompatibilityEnd(text: string, block: QuestionBlock): number {
  const questions = parseQuestionText(text).filter((item): item is QuestionBlock => item.kind === "question");
  const stimulus = findStimuli(text, questions).find(item => item.start > block.start && item.start < block.end);
  return stimulus?.start ?? block.end;
}
