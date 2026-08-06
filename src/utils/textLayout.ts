export interface TextRange {
  start: number;
  end: number;
}

export interface PassageBlock extends TextRange {
  kind: "passage";
  text: string;
}

export interface ParagraphBlock extends TextRange {
  kind: "paragraph";
  text: string;
}

export interface ChoiceBlock extends TextRange {
  marker: string;
  text: string;
}

export interface QuestionBodySegment extends TextRange {
  kind: "body" | "condition" | "view";
  text: string;
  label?: string;
}

export interface QuestionBlock extends TextRange {
  kind: "question";
  numberLabel: string;
  displayNumber: number;
  body: string;
  bodyStart: number;
  bodyEnd: number;
  bodySegments: QuestionBodySegment[];
  choices: ChoiceBlock[];
}

export type QuestionTextBlock = PassageBlock | ParagraphBlock | QuestionBlock;

interface LineInfo {
  text: string;
  start: number;
  end: number;
}

const QUESTION_RE = /^\s*(?:\[\s*)?(?:(문제\s*(0?[1-9]\d{0,2}))|(#(0?[1-9]\d{0,2}))|(0?[1-9]\d{0,2})([.)]|번))\s*(?:\])?\s*/;
const CHOICE_RE = /^\s*((?:[①②③④⑤⑥⑦⑧⑨⑩])|(?:\(\d{1,2}\))|(?:\d{1,2}\))|(?:[ㄱ-ㅎA-Ea-e][.)]))\s*/;
const VIEW_MARKER_RE = /^\s*(?:<\s*보기\s*>|보기)\s*$/;
const VIEW_ITEM_RE = /^\s*(?:[ㄱ-ㅎ][.)]|[ㄱ-ㅎ]\s*[:：])\s*/;
const CONDITION_RE = /^\s*(?:(?:조건|자료|제시문|그림|도표|그래프|표)\s*[:：]|(?:\([가-힣]\)|[가-힣][.)])\s*)/;

function getLines(text: string): LineInfo[] {
  const lines: LineInfo[] = [];
  const re = /.*(?:\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match[0] === "" && match.index === text.length) break;
    const raw = match[0];
    const lineText = raw.replace(/\r?\n|\r$/, "");
    lines.push({
      text: lineText,
      start: match.index,
      end: match.index + lineText.length,
    });
    if (re.lastIndex === text.length) break;
  }

  return lines;
}

function isQuestionStart(line: string, previousLine?: LineInfo) {
  const match = matchQuestion(line);
  if (!match) return false;
  const punctuation = match[6];
  if (punctuation === ")" && previousLine?.text.trim()) return false;
  return true;
}

function matchQuestion(line: string) {
  return line.match(QUESTION_RE);
}

function matchChoice(line: string) {
  return line.match(CHOICE_RE);
}

function isViewMarker(line: string): boolean {
  return VIEW_MARKER_RE.test(line.trim());
}

function isViewItem(line: string): boolean {
  return VIEW_ITEM_RE.test(line);
}

function conditionLabel(line: string): string | undefined {
  const trimmed = line.trim();
  const named = trimmed.match(/^((?:조건|자료|제시문|그림|도표|그래프|표))\s*[:：]/);
  if (named) return named[1];
  const letter = trimmed.match(/^(\([가-힣]\)|[가-힣][.)])/);
  return letter?.[1];
}

function bodyLineKind(line: string, previousKind?: QuestionBodySegment["kind"]): QuestionBodySegment["kind"] {
  if (!line.trim()) return previousKind ?? "body";
  if (isViewMarker(line) || isViewItem(line)) return "view";
  if (CONDITION_RE.test(line)) return "condition";
  if (previousKind === "view" || previousKind === "condition") return previousKind;
  return "body";
}

function splitBodySegments(text: string, ranges: TextRange[]): QuestionBodySegment[] {
  if (!ranges.length) return [];
  const segments: Array<{ kind: QuestionBodySegment["kind"]; start: number; end: number; label?: string }> = [];

  for (const range of ranges) {
    const line = text.slice(range.start, range.end);
    const previous = segments.at(-1);
    const kind = bodyLineKind(line, previous?.kind);
    const label = kind === "condition" ? conditionLabel(line) : kind === "view" ? "<보기>" : undefined;
    if (previous && previous.kind === kind) {
      previous.end = range.end;
      previous.label = previous.label ?? label;
    } else {
      segments.push({ kind, start: range.start, end: range.end, label });
    }
  }

  return segments
    .map((segment) => {
      const range = trimRange(text, segment.start, segment.end);
      return {
        kind: segment.kind,
        text: text.slice(range.start, range.end),
        start: range.start,
        end: range.end,
        label: segment.label,
      };
    })
    .filter((segment) => segment.text.trim());
}

function trimRange(text: string, start: number, end: number): TextRange {
  let nextStart = start;
  let nextEnd = end;
  while (nextStart < nextEnd && /\s/.test(text[nextStart])) nextStart++;
  while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1])) nextEnd--;
  return { start: nextStart, end: nextEnd };
}

function makeTextBlock(
  text: string,
  kind: "passage" | "paragraph",
  start: number,
  end: number,
): PassageBlock | ParagraphBlock | null {
  const range = trimRange(text, start, end);
  if (range.start >= range.end) return null;
  return {
    kind,
    start: range.start,
    end: range.end,
    text: text.slice(range.start, range.end),
  };
}

function parseQuestionBlock(text: string, lines: LineInfo[], displayNumber: number): QuestionBlock | null {
  const first = lines[0];
  const questionMatch = matchQuestion(first.text);
  if (!questionMatch) return null;

  const numberStart = first.start + first.text.indexOf(questionMatch[0]);
  const numberLabel =
    questionMatch[2] ?? questionMatch[3] ?? questionMatch[5] ?? String(displayNumber);
  const contentStart = first.start + questionMatch[0].length;
  const blockEnd = lines[lines.length - 1].end;
  const choices: ChoiceBlock[] = [];
  const bodyRanges: TextRange[] = [];
  let insideView = false;

  for (const line of lines) {
    if (!line.text.trim()) continue;
    if (line === first) {
      if (contentStart < line.end) bodyRanges.push({ start: contentStart, end: line.end });
      continue;
    }

    if (isViewMarker(line.text)) {
      insideView = true;
      bodyRanges.push({ start: line.start, end: line.end });
      continue;
    }

    if (insideView && isViewItem(line.text)) {
      bodyRanges.push({ start: line.start, end: line.end });
      continue;
    }

    const choiceMatch = matchChoice(line.text);
    if (choiceMatch) {
      insideView = false;
      const choiceTextStart = line.start + choiceMatch[0].length;
      const choiceRange = trimRange(text, choiceTextStart, line.end);
      choices.push({
        marker: choiceMatch[1],
        text: text.slice(choiceRange.start, choiceRange.end),
        start: choiceRange.start,
        end: choiceRange.end,
      });
    } else if (
      choices.length > 0 &&
      !isQuestionStart(line.text, lines[lines.indexOf(line) - 1]) &&
      !isChoiceContinuationBoundary(line.text)
    ) {
      const previous = choices[choices.length - 1];
      const continuation = line.text.trim();
      if (continuation) {
        previous.text = `${previous.text}\n${continuation}`.trim();
        previous.end = line.end;
      }
    } else if (isChoiceContinuationBoundary(line.text) && hasBlankLineBefore(text, line.start)) {
      // A separated 자료/표 heading starts the next stimulus group, not the
      // preceding choice's continuation or question body.
      continue;
    } else {
      bodyRanges.push({ start: line.start, end: line.end });
    }
  }

  const rawBodyStart = bodyRanges.length ? bodyRanges[0].start : contentStart;
  const rawBodyEnd = bodyRanges.length ? bodyRanges[bodyRanges.length - 1].end : contentStart;
  const bodyRange = trimRange(text, rawBodyStart, rawBodyEnd);

  return {
    kind: "question",
    numberLabel,
    displayNumber,
    body: text.slice(bodyRange.start, bodyRange.end),
    bodyStart: bodyRange.start,
    bodyEnd: bodyRange.end,
    bodySegments: splitBodySegments(text, bodyRanges),
    choices,
    start: numberStart,
    end: blockEnd,
  };
}

function isChoiceContinuationBoundary(line: string): boolean {
  const trimmed = line.trim();
  return /^(?:\[|<)\s*(?:자료|제시문|지문|도표|그래프|그림|표)(?:\s*[A-Za-z가-힣0-9]+)?\s*(?:\]|>)$/.test(trimmed)
    || /^표\s*(?::|：)\s*$/.test(trimmed)
    || /^표\s+\d+\b/.test(trimmed);
}

function hasBlankLineBefore(text: string, start: number): boolean {
  return /(?:\r\n|\n|\r)[ \t]*(?:\r\n|\n|\r)[ \t]*$/.test(text.slice(0, start));
}

export function parseQuestionText(text: string): QuestionTextBlock[] {
  if (!text.trim()) return [];

  const lines = getLines(text);
  const questionIndexes = lines
    .map((line, index) => (isQuestionStart(line.text, lines[index - 1]) ? index : -1))
    .filter((index) => index >= 0);

  if (!questionIndexes.length) {
    const block = makeTextBlock(text, "paragraph", 0, text.length);
    return block ? [block] : [];
  }

  const blocks: QuestionTextBlock[] = [];
  const firstQuestion = questionIndexes[0];
  if (firstQuestion > 0) {
    const passage = makeTextBlock(
      text,
      "passage",
      lines[0].start,
      lines[firstQuestion - 1].end,
    );
    if (passage) blocks.push(passage);
  }

  for (let i = 0; i < questionIndexes.length; i++) {
    const startIndex = questionIndexes[i];
    const nextIndex = questionIndexes[i + 1] ?? lines.length;
    const question = parseQuestionBlock(text, lines.slice(startIndex, nextIndex), i + 1);
    if (question) blocks.push(question);
  }

  return blocks.length ? blocks : [makeTextBlock(text, "paragraph", 0, text.length)!];
}

export interface MarkdownTableSegment {
  kind: "table";
  rows: string[][];
}

export type TextTableSegment = string | MarkdownTableSegment;

function isMarkdownTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseMarkdownTableLine(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function splitMarkdownTableSegments(text: string): TextTableSegment[] {
  const lines = text.split(/\r?\n/);
  const segments: TextTableSegment[] = [];
  let buffer: string[] = [];
  let index = 0;

  const flushBuffer = () => {
    if (buffer.length) {
      segments.push(buffer.join("\n"));
      buffer = [];
    }
  };

  while (index < lines.length) {
    if (
      index + 1 < lines.length &&
      lines[index].includes("|") &&
      isMarkdownTableSeparator(lines[index + 1])
    ) {
      flushBuffer();
      const tableLines = [lines[index]];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }
      segments.push({
        kind: "table",
        rows: tableLines.map(parseMarkdownTableLine),
      });
      continue;
    }
    buffer.push(lines[index]);
    index += 1;
  }

  flushBuffer();
  return segments.filter((segment) => typeof segment !== "string" || segment.trim());
}
