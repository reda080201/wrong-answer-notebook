import { cloneElement, isValidElement, useLayoutEffect, useRef, type ReactNode } from "react";
import katex from "katex";

export type MathDisplaySegment =
  | { type: "text"; value: string }
  | { type: "math"; raw: string; expression: string; displayMode: boolean }
  | { type: "invalid-math"; raw: string; reason: string };

const COMMANDS = new Set(["times", "cdot", "div", "pm", "mp", "ge", "geq", "le", "leq", "neq", "approx", "to", "rightarrow", "leftarrow", "leftrightarrow", "in", "notin", "subset", "supset", "cup", "cap", "parallel", "perp", "angle", "triangle", "circ", "infty", "sum", "prod", "frac", "sqrt", "int", "lim", "sin", "cos", "tan", "log", "ln", "left", "right"]);
const ENVIRONMENTS = new Set(["cases", "aligned", "array"]);
const OPENERS = ["$$", "\\[", "\\(", "$"] as const;

function isBoundary(value: string, index: number): boolean {
  if (index === 0) return true;
  return /[\s([{,:;=+\-*]/.test(value[index - 1]);
}

function findClosingDelimiter(value: string, start: number, opener: string): number {
  const closer = opener === "$$" ? "$$" : opener === "\\[" ? "\\]" : opener === "\\(" ? "\\)" : "$";
  let escaped = false;
  for (let index = start + opener.length; index < value.length; index += 1) {
    if (escaped) { escaped = false; continue; }
    if (value[index] === "\\") { escaped = true; continue; }
    if (value.startsWith(closer, index)) return index;
  }
  return -1;
}

function invalidEnd(value: string, start: number, opener: string): number {
  const newline = value.indexOf("\n", start + opener.length);
  if (newline >= 0) return newline;
  const whitespace = value.slice(start + opener.length).search(/[\s.,!?]/);
  return whitespace >= 0 ? start + opener.length + whitespace : Math.min(value.length, start + opener.length + 24);
}

function readBalanced(value: string, start: number): number {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === "{") depth += 1;
    if (value[index] === "}") { depth -= 1; if (depth === 0) return index + 1; }
  }
  return -1;
}

function readRawCommand(value: string, start: number): { end: number; raw: string } | null {
  const previous = value[start - 1];
  if (!isBoundary(value, start) && !(value[start] === "\\" && /[)\]}]/.test(previous ?? ""))) return null;
  const match = value.slice(start + 1).match(/^(begin\{([A-Za-z]+)\}|[A-Za-z]+)/);
  if (!match) return null;
  const command = match[1];
  const environment = match[2];
  if (environment && ENVIRONMENTS.has(environment)) {
    const endMarker = `\\end{${environment}}`;
    const end = value.indexOf(endMarker, start + 1 + command.length);
    return end < 0 ? null : { end: end + endMarker.length, raw: value.slice(start, end + endMarker.length) };
  }
  if (!COMMANDS.has(command)) return null;
  let end = start + command.length + 1;
  if (command === "left") {
    const right = value.indexOf("\\right", end);
    if (right >= 0) {
      const rightEnd = Math.min(value.length, right + "\\right".length + 1);
      return { end: rightEnd, raw: value.slice(start, rightEnd) };
    }
  }
  for (let count = 0; count < 3 && value[end] === "{"; count += 1) {
    const next = readBalanced(value, end);
    if (next < 0) return null;
    end = next;
  }
  // A raw command is commonly followed by scripts, delimiters, variables and
  // further commands (for example `\\int_1^3\\left(x\\right)\\,dx=2`).
  // Keeping that expression together lets KaTeX validate it as a single unit
  // while stopping before ordinary prose.
  let cursor = end;
  let depth = 0;
  while (cursor < value.length) {
    const character = value[cursor];
    if (/[^\x00-\x7F]/.test(character) || /[\r\n]/.test(character)) break;
    if (/\s/.test(character)) break;
    if (character === "{") depth += 1;
    if (character === "}") {
      if (depth === 0) break;
      depth -= 1;
    }
    // Raw prose punctuation ends an expression, except the TeX punctuation
    // that appears after a command or within a number.
    if (depth === 0 && /[!?;]/.test(character)) break;
    cursor += 1;
  }
  return { end: cursor, raw: value.slice(start, cursor) };
}

function commandExpression(raw: string) {
  const expression = raw.startsWith("/") ? `\\${raw.slice(1)}` : raw;
  return { expression, displayMode: /^(?:\\(?:begin\{(?:cases|aligned|array)\}|sum|prod|int|lim))/.test(expression) };
}

export function tokenizeMathForDisplay(text: string): MathDisplaySegment[] {
  const result: MathDisplaySegment[] = [];
  let cursor = 0;
  let textStart = 0;
  const pushText = (end: number) => { if (end > textStart) result.push({ type: "text", value: text.slice(textStart, end) }); };
  while (cursor < text.length) {
    const opener = OPENERS.find((candidate) => text.startsWith(candidate, cursor));
    if (opener && isBoundary(text, cursor)) {
      const close = findClosingDelimiter(text, cursor, opener);
      if (close < 0) {
        const end = invalidEnd(text, cursor, opener);
        pushText(cursor);
        result.push({ type: "invalid-math", raw: text.slice(cursor, end), reason: "닫히지 않은 수식 구분자" });
        cursor = end; textStart = end; continue;
      }
      pushText(cursor);
      const closer = opener === "$$" ? "$$" : opener === "\\[" ? "\\]" : opener === "\\(" ? "\\)" : "$";
      const raw = text.slice(cursor, close + closer.length);
      result.push({ type: "math", raw, expression: raw.slice(opener.length, -closer.length), displayMode: opener === "$$" || opener === "\\[" });
      cursor = close + closer.length; textStart = cursor; continue;
    }
    const command = (text[cursor] === "\\" || text[cursor] === "/") ? readRawCommand(text, cursor) : null;
    if (command) {
      pushText(cursor);
      const parsed = commandExpression(command.raw);
      result.push({ type: "math", raw: command.raw, expression: parsed.expression, displayMode: parsed.displayMode });
      cursor = command.end; textStart = cursor; continue;
    }
    cursor += 1;
  }
  pushText(text.length);
  return result;
}

export function splitMathText(text: string): MathDisplaySegment[] { return tokenizeMathForDisplay(text); }

function MathFragment({ segment }: { segment: Extract<MathDisplaySegment, { type: "math" }> }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.textContent = "";
    container.className = segment.displayMode ? "math-fragment math-fragment--display" : "math-fragment";
    try { katex.render(segment.expression, container, { displayMode: segment.displayMode, throwOnError: true, trust: false, strict: "warn", output: "htmlAndMathml" }); }
    catch { container.className = "math-fragment--invalid"; container.textContent = "수식 형식 확인 필요"; }
  }, [segment.displayMode, segment.expression]);
  return <span ref={containerRef} className={segment.displayMode ? "math-fragment math-fragment--display" : "math-fragment"} aria-label="수식" />;
}

export default function MathText({ text }: { text: string }) {
  return <>{tokenizeMathForDisplay(text).map((segment, index) => {
    if (segment.type === "text") return <span key={`text-${index}`}>{segment.value}</span>;
    if (segment.type === "invalid-math") return <span key={`invalid-${index}`} className="math-fragment--invalid" role="status">수식 형식 확인 필요</span>;
    return <MathFragment key={`${segment.raw}-${index}`} segment={segment} />;
  })}</>;
}

export function renderMathInNodes(nodes: ReactNode[]): ReactNode[] {
  return nodes.flatMap((node, index) => {
    if (typeof node === "string") return <MathText key={`math-text-${index}`} text={node} />;
    if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
      const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
      return cloneElement(node, undefined, renderMathInNodes(children));
    }
    return node;
  });
}
