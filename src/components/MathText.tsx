import {
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import katex from "katex";
import { hasUnbalancedMathDelimiter, normalizeMathForDisplay } from "../utils/mathDisplay";

interface MathToken {
  raw: string;
  expression: string;
  displayMode: boolean;
}

const MATH_PATTERN = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\$)(?:\\.|[^$\n])+\$)/g;
const RAW_LATEX_PATTERN = /\\(?:sum|frac|lim|sqrt|sin|cos|tan|log|int|left|right|begin\{cases\}|infty)(?:\\[A-Za-z]+|[A-Za-z0-9{}_^+\-*/=().,|!\s])*|(?:[A-Za-z0-9{}()]+(?:\^[A-Za-z0-9{}()+\-*/=.,]+|_[A-Za-z0-9{}()+\-*/=.,]+))+/g;

function toMathToken(raw: string): MathToken {
  if (raw.startsWith("$$")) return { raw, expression: raw.slice(2, -2), displayMode: true };
  if (raw.startsWith("\\[")) return { raw, expression: raw.slice(2, -2), displayMode: true };
  if (raw.startsWith("\\(")) return { raw, expression: raw.slice(2, -2), displayMode: false };
  return { raw, expression: raw.slice(1, -1), displayMode: false };
}

export function splitMathText(text: string): Array<string | MathToken> {
  const explicitRanges = [...text.matchAll(MATH_PATTERN)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    token: toMathToken(match[0]),
  }));
  const rawRanges = [...text.matchAll(RAW_LATEX_PATTERN)]
    .map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, raw: match[0].trim() }))
    .filter((range) => range.raw.length > 1 && !explicitRanges.some((explicit) => range.start < explicit.end && range.end > explicit.start));
  const ranges = [
    ...explicitRanges.map((range) => ({ start: range.start, end: range.end, token: range.token })),
    ...rawRanges.map((range) => ({ start: range.start, end: range.end, token: { raw: range.raw, expression: range.raw, displayMode: /^\\(?:begin\{cases\}|sum|frac|int|lim)/.test(range.raw) && !/[가-힣]/.test(range.raw) } })),
  ].sort((a, b) => a.start - b.start);
  const result: Array<string | MathToken> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) result.push(text.slice(cursor, range.start));
    result.push(range.token);
    cursor = range.end;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

function MathFragment({ token }: { token: MathToken }) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.textContent = "";
    container.className = token.displayMode
      ? "math-fragment math-fragment--display"
      : "math-fragment";

    try {
      katex.render(token.expression, container, {
        displayMode: token.displayMode,
        throwOnError: true,
        trust: false,
        strict: "warn",
        output: "htmlAndMathml",
      });
    } catch {
      container.className = "math-fragment--invalid";
      container.textContent = "수식 형식 확인 필요";
    }
  }, [token.displayMode, token.expression, token.raw]);

  return (
    <span
      ref={containerRef}
      className={token.displayMode ? "math-fragment math-fragment--display" : "math-fragment"}
    />
  );
}

export default function MathText({ text }: { text: string }) {
  const displayText = normalizeMathForDisplay(text);
  if (hasUnbalancedMathDelimiter(displayText)) {
    return <span className="math-source-warning" role="status" title="원문은 변경되지 않았습니다. Text Review에서 수식을 확인하세요.">수식 형식 확인 필요</span>;
  }
  return (
    <>
      {splitMathText(displayText).map((part, index) =>
        typeof part === "string" ? part : <MathFragment key={`${part.raw}-${index}`} token={part} />,
      )}
    </>
  );
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
