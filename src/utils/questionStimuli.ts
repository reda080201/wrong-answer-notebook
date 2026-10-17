import type { WrongAnswerEntry } from "../types";
import { parseQuestionText, type QuestionBlock } from "./textLayout";
import { normalizeQuestionNumber } from "./questionNumber";
import { questionStimulusHead, type QuestionStimulusHead } from "./questionStimulusHead";

export interface EntryQuestionStimulus { id: string; text: string; start: number; end: number; }

interface StimulusRange {
  id: string;
  start: number;
  end: number;
  text: string;
  scope?: QuestionStimulusHead;
}

function findStimuli(text: string, questions: QuestionBlock[]): StimulusRange[] {
  const markers = getExplicitStimulusStarts(text).filter((start) => isNextGroupStimulusMarker(start, text, questions));
  const grouped: StimulusRange[] = [];
  for (const start of markers) {
    const end = questions.find(question => question.start > start)?.start ?? text.length;
    const scope = questionStimulusHead(text.slice(start).split(/\r\n|\n|\r/, 1)[0]);
    const previous = grouped.at(-1);
    // A range heading followed by [지문]/[자료] is one stimulus, including its range.
    if (previous?.end === end) {
      if (scope?.range || scope?.invalidRange) {
        previous.scope = previous.scope?.range || previous.scope?.invalidRange ? { invalidRange: true } : scope;
      }
      continue;
    }
    grouped.push({ id: `stimulus-${grouped.length + 1}`, start, end, text: text.slice(start, end).trim(), scope });
  }
  // The parser's leading passage is also source content, even without a named heading.
  if (questions.length && (!grouped.length || grouped[0].start > questions[0].start)) {
    const leading = text.slice(0, questions[0].start).trim();
    if (leading) grouped.unshift({ id: "stimulus-leading", start: 0, end: questions[0].start, text: leading });
  }
  return grouped.filter(item => item.text);
}

/** Read-only grouping projection shared by entry readers and exam snapshots. */
export function resolveEntryQuestionStimuli(entry: Pick<WrongAnswerEntry, "question">): Map<string, EntryQuestionStimulus> {
  return resolveEntryQuestionStimulusProjection(entry).stimuli;
}

export function resolveEntryQuestionStimulusProjection(entry: Pick<WrongAnswerEntry, "question">): {
  stimuli: Map<string, EntryQuestionStimulus>; warnings: Map<string, string>;
} {
  const questions = parseQuestionText(entry.question).filter((item): item is QuestionBlock => item.kind === "question");
  const stimuli = findStimuli(entry.question, questions);
  const warnings = new Map<string, string>();
  const result = new Map<string, EntryQuestionStimulus>();
  for (const question of questions) {
    const number = normalizeQuestionNumber(String(question.numberLabel ?? question.displayNumber));
    const stimulus = stimuli.filter((item) => item.start < question.start).at(-1);
    const unique = questions.filter(item => normalizeQuestionNumber(String(item.numberLabel ?? item.displayNumber)) === number).length === 1;
    if (!number || !stimulus) continue;
    const range = stimulus.scope?.range;
    const inRange = !range || (Number(number) >= range.first && Number(number) <= range.last);
    const targets = range ? questions.filter(item => item.start >= stimulus.end
      && Number(normalizeQuestionNumber(item.numberLabel)) >= range.first
      && Number(normalizeQuestionNumber(item.numberLabel)) <= range.last) : [];
    const targetNumbers = targets.map(item => Number(normalizeQuestionNumber(item.numberLabel)));
    const validRange = !range || (targets[0]?.start === stimulus.end && targetNumbers.length === range.last - range.first + 1
      && targetNumbers.every((value, index) => value === range.first + index
        && questions.filter(item => Number(normalizeQuestionNumber(item.numberLabel)) === value).length === 1));
    if ((!unique && inRange) || stimulus.scope?.invalidRange || !validRange) {
      warnings.set(number, "공통 지문의 문항 범위 또는 중복 번호를 확인해 주세요. 원문에서 지문을 확인할 수 있습니다.");
      continue;
    }
    if (!inRange) continue;
    result.set(number, { id: stimulus.id, start: stimulus.start, end: stimulus.end, text: stimulus.text });
  }
  return { stimuli: result, warnings };
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
  return Boolean(questionStimulusHead(line));
}

/** Limit edits to the question itself; never consume a following shared passage. */
export function questionCompatibilityEnd(text: string, block: QuestionBlock): number {
  const questions = parseQuestionText(text).filter((item): item is QuestionBlock => item.kind === "question");
  const stimulus = findStimuli(text, questions).find(item => item.start > block.start && item.start < block.end);
  return stimulus?.start ?? block.end;
}
