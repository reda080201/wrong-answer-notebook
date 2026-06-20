import { cloneElement, isValidElement, type ReactNode } from "react";
import katex from "katex";

interface MathToken {
  raw: string;
  expression: string;
  displayMode: boolean;
}

const MATH_PATTERN = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\$)(?:\\.|[^$\n])+\$)/g;

function toMathToken(raw: string): MathToken {
  if (raw.startsWith("$$")) return { raw, expression: raw.slice(2, -2), displayMode: true };
  if (raw.startsWith("\\[")) return { raw, expression: raw.slice(2, -2), displayMode: true };
  if (raw.startsWith("\\(")) return { raw, expression: raw.slice(2, -2), displayMode: false };
  return { raw, expression: raw.slice(1, -1), displayMode: false };
}

export function splitMathText(text: string): Array<string | MathToken> {
  const result: Array<string | MathToken> = [];
  let cursor = 0;
  for (const match of text.matchAll(MATH_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push(text.slice(cursor, index));
    result.push(toMathToken(match[0]));
    cursor = index + match[0].length;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

function MathFragment({ token }: { token: MathToken }) {
  let html: string;
  try {
    html = katex.renderToString(token.expression, {
      displayMode: token.displayMode,
      throwOnError: true,
      trust: false,
      strict: "warn",
      output: "htmlAndMathml",
    });
  } catch {
    html = "";
  }
  if (!html) return <span className="math-fragment--invalid">{token.raw}</span>;
  return (
    <span
      className={token.displayMode ? "math-fragment math-fragment--display" : "math-fragment"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function MathText({ text }: { text: string }) {
  return (
    <>
      {splitMathText(text).map((part, index) =>
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
