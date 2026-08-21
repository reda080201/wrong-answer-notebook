import { normalizeLegacyMathCommandsForDisplay } from "./legacyMathCommands";

export type MathDisplaySegment =
  | { type: "text"; value: string }
  | { type: "math"; raw: string; expression: string; displayMode: boolean }
  | { type: "invalid-math"; raw: string; reason: string };

const LEGACY_COMMAND = /\\(?:frac|sqrt|times|sum|int|lim|sin|cos|tan|log|left|right)(?![A-Za-z])/y;
const ENVIRONMENT_START = /\\begin\{(cases|aligned|array)\}/y;
const ENVIRONMENT_END = /\\end\{(cases|aligned|array)\}/y;

function findClosingBrace(value: string, start: number): number {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === "{" && value[index - 1] !== "\\") depth += 1;
    if (value[index] === "}" && value[index - 1] !== "\\") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function readLegacyCommand(value: string, start: number): { end: number; raw: string; invalid?: string } | null {
  LEGACY_COMMAND.lastIndex = start;
  const command = LEGACY_COMMAND.exec(value);
  if (!command) return null;

  let end = start + command[0].length;
  if (command[0] === "\\frac" || command[0] === "\\sqrt") {
    const firstBrace = value.indexOf("{", end);
    if (firstBrace !== end) return { end: value.length, raw: value.slice(start), invalid: "완성되지 않은 수식" };
    const firstEnd = findClosingBrace(value, firstBrace);
    if (firstEnd < 0) return { end: value.length, raw: value.slice(start), invalid: "완성되지 않은 수식" };
    end = firstEnd + 1;
    if (command[0] === "\\frac") {
      if (value[end] !== "{") return { end: value.length, raw: value.slice(start), invalid: "완성되지 않은 분수" };
      const secondEnd = findClosingBrace(value, end);
      if (secondEnd < 0) return { end: value.length, raw: value.slice(start), invalid: "완성되지 않은 분수" };
      end = secondEnd + 1;
    }
  }
  return { end, raw: value.slice(start, end) };
}

function readEnvironment(value: string, start: number): { end: number; raw: string; invalid?: string } | null {
  ENVIRONMENT_START.lastIndex = start;
  const opening = ENVIRONMENT_START.exec(value);
  if (!opening) return null;
  const environment = opening[1];
  const closing = `\\end{${environment}}`;
  const closingIndex = value.indexOf(closing, start + opening[0].length);
  if (closingIndex < 0) return { end: value.length, raw: value.slice(start), invalid: `닫히지 않은 ${environment} 환경` };
  const end = closingIndex + closing.length;
  return { end, raw: value.slice(start, end) };
}

function readExplicitMath(value: string, start: number): { end: number; raw: string; expression: string; displayMode: boolean } | null {
  const opener = value.startsWith("$$", start) ? "$$" : value.startsWith("\\[", start) ? "\\[" : value.startsWith("\\(", start) ? "\\(" : value[start] === "$" ? "$" : "";
  if (!opener) return null;
  const closer = opener === "$$" ? "$$" : opener === "\\[" ? "\\]" : opener === "\\(" ? "\\)" : "$";
  let close = value.indexOf(closer, start + opener.length);
  while (close > start && value[close - 1] === "\\") close = value.indexOf(closer, close + closer.length);
  if (close < 0) return null;
  const end = close + closer.length;
  return { end, raw: value.slice(start, end), expression: value.slice(start + opener.length, close), displayMode: opener === "$$" || opener === "\\[" };
}

/** Returns display segments without changing the canonical source string. */
export function tokenizeMathForDisplay(source: string): MathDisplaySegment[] {
  const value = normalizeLegacyMathCommandsForDisplay(source);
  const segments: MathDisplaySegment[] = [];
  let cursor = 0;
  let textStart = 0;
  const flushText = (end: number) => {
    if (end > textStart) segments.push({ type: "text", value: value.slice(textStart, end) });
  };

  while (cursor < value.length) {
    const explicit = readExplicitMath(value, cursor);
    if (explicit) {
      flushText(cursor);
      segments.push({ type: "math", raw: explicit.raw, expression: explicit.expression, displayMode: explicit.displayMode });
      cursor = explicit.end;
      textStart = cursor;
      continue;
    }
    if (value.startsWith("$$", cursor) || value[cursor] === "$" || value.startsWith("\\[", cursor) || value.startsWith("\\(", cursor)) {
      flushText(cursor);
      segments.push({ type: "invalid-math", raw: value.slice(cursor), reason: "닫히지 않은 수식 구분자" });
      return segments;
    }

    ENVIRONMENT_END.lastIndex = cursor;
    const orphanEnd = ENVIRONMENT_END.exec(value);
    if (orphanEnd) {
      flushText(cursor);
      segments.push({ type: "invalid-math", raw: orphanEnd[0], reason: "짝이 없는 수식 환경 종료" });
      cursor += orphanEnd[0].length;
      textStart = cursor;
      continue;
    }
    const environment = readEnvironment(value, cursor);
    if (environment) {
      flushText(cursor);
      segments.push(environment.invalid
        ? { type: "invalid-math", raw: environment.raw, reason: environment.invalid }
        : { type: "math", raw: environment.raw, expression: environment.raw, displayMode: true });
      cursor = environment.end;
      textStart = cursor;
      continue;
    }

    const command = readLegacyCommand(value, cursor);
    if (command) {
      flushText(cursor);
      segments.push(command.invalid
        ? { type: "invalid-math", raw: command.raw, reason: command.invalid }
        : { type: "math", raw: command.raw, expression: command.raw, displayMode: command.raw.startsWith("\\frac") || command.raw.startsWith("\\sqrt") });
      cursor = command.end;
      textStart = cursor;
      continue;
    }
    cursor += 1;
  }
  flushText(value.length);
  return segments.length ? segments : [{ type: "text", value: source }];
}
