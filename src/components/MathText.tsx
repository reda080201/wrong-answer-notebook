import {
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import katex from "katex";
import { tokenizeMathForDisplay, type MathDisplaySegment } from "../utils/mathDisplay";

function MathFragment({ token }: { token: Extract<MathDisplaySegment, { type: "math" }> }) {
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
      container.className = token.displayMode ? "math-fragment math-fragment--display" : "math-fragment";
    } catch {
      container.className = "math-fragment--invalid";
      container.textContent = "수식 형식 확인 필요";
      container.setAttribute("aria-label", "수식 형식 확인 필요");
      container.dataset.mathSource = token.raw;
    }
  }, [token.displayMode, token.expression, token.raw]);

  return (
    <span
      ref={containerRef}
      className={token.displayMode ? "math-fragment math-fragment--display" : "math-fragment"}
    />
  );
}

function InvalidMathFragment({ token }: { token: Extract<MathDisplaySegment, { type: "invalid-math" }> }) {
  return (
    <span
      className="math-fragment--invalid"
      role="status"
      aria-label="수식 형식 확인 필요"
      data-math-source={token.raw}
      title={token.reason}
    >
      수식 형식 확인 필요
    </span>
  );
}

export default function MathText({ text }: { text: string }) {
  return (
    <>
      {tokenizeMathForDisplay(text).map((part, index) => {
        if (part.type === "text") return <span key={`text-${index}`}>{part.value}</span>;
        if (part.type === "invalid-math") return <InvalidMathFragment key={`invalid-${index}`} token={part} />;
        return <MathFragment key={`${part.raw}-${index}`} token={part} />;
      })}
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
