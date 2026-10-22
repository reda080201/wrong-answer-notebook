import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MathText from "./MathText";
import { typesetMathExpression } from "../utils/mathTypesetting";

describe("MathText", () => {
  it("lays out long display equations only at explicit top-level gaps", () => {
    const text = String.raw`\frac12\sum_{k=1}^{n-1}a_k=Area(P_nH_nH_{n+1}P_{n+1}),\qquad a_n+a_{n+1}=\sum_{k=1}^{n-1}a_k,\qquad a_{n+2}=2a_n`;
    const { container } = render(<MathText text={`$$${text}$$`} />);
    expect(container.querySelectorAll(".katex-mathml mtable > mtr")).toHaveLength(3);
    expect(container.querySelector(".math-fragment--invalid")).toBeNull();
    expect(typesetMathExpression(text, false)).not.toContain("gathered");
  });
  it("preserves gaps inside command arguments and explicit environments", () => {
    const text = String.raw`\begin{aligned}a+b+c+d+e+f+g+h+i+j+k+l+m+n+o+p+q+r+s+t+u+v+w+x+y+z=1\qquad x=2\end{aligned}`;
    expect(typesetMathExpression(text, true)).not.toContain("gathered");
    const nested = String.raw`x=\text{a very long explanation of a condition that must stay together \qquad with its conclusion}`;
    expect(typesetMathExpression(nested, true)).not.toContain("gathered");
  });
  it("keeps braces visible for a plain numeric set assignment", () => {
    expect(typesetMathExpression("X={2,3,4,5,6}")).toBe(String.raw`X=\{2,3,4,5,6\}`);
    expect(typesetMathExpression(String.raw`\frac{1}{2}`)).toBe(String.raw`\displaystyle \frac{1}{2}`);
  });
  it("keeps MathML content exposed without replacing it with a generic math label", () => {
    const { container } = render(<MathText text={"앞 $x^2$ 뒤"} />);
    expect(container.querySelector('.math-fragment[aria-label="수식"]')).toBeNull();
    const math = container.querySelector(".katex-mathml math msup");
    expect(math?.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML");
    expect(math?.textContent).toBe("x2");
    expect(container.querySelector(".katex-html")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("앞", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("뒤", { exact: false })).toBeInTheDocument();
  });
  it("renders inline and display LaTeX with KaTeX", () => {
    const { container } = render(<MathText text={"값은 $x^2$이고 $$y=2x$$이다."} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector(".math-fragment--display")).toBeInTheDocument();
  });

  it("recognizes escaped-parenthesis and escaped-bracket closers", () => {
    const { container } = render(<MathText text={String.raw`앞 \(x^2+1\) 뒤 \[y^2\] 끝`} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(screen.getByText("앞", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("끝", { exact: false })).toBeInTheDocument();
  });

  it("keeps an escaped dollar as ordinary text", () => {
    const { container } = render(<MathText text={String.raw`가격은 \$5이고 $x+1$이다.`} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(1);
    expect(screen.getByText(/가격은/)).toBeInTheDocument();
  });

  it("keeps surrounding text and marks invalid LaTeX without exposing raw source", () => {
    render(<MathText text={"잘못된 $\\notacommand{$ 수식"} />);
    expect(screen.getByText("수식 형식 확인 필요")).toBeInTheDocument();
    expect(screen.getByText("수식")).toBeInTheDocument();
  });

  it("preserves ordinary text after an unmatched display opener", () => {
    render(<MathText text={"앞 문장 $$x^2\n뒤의 정상 설명 문장"} />);
    expect(screen.getByText("앞 문장", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("수식 형식 확인 필요")).toBeInTheDocument();
    expect(screen.getByText("뒤의 정상 설명 문장", { exact: false })).toBeInTheDocument();
  });

  it("renders supported commands and environments as math", () => {
    const { container } = render(
      <MathText text={String.raw`$\times \cdot \div \pm \geq \leq \neq \to \in \cup \perp \angle \infty \sum \frac{1}{2} \sqrt{x} \int \lim \sin x$`} />,
    );
    expect(container.querySelector(".katex")).toBeInTheDocument();
    expect(screen.queryByText("수식 형식 확인 필요")).not.toBeInTheDocument();
  });

  it("supports cases, aligned, array and left-right expressions", () => {
    const { container } = render(
      <MathText text={String.raw`\begin{cases}x & x>0\\0 & otherwise\end{cases} \begin{aligned}a&=b\end{aligned} \begin{array}{cc}1&2\end{array} \left(x\right)`} />,
    );
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("수식 형식 확인 필요")).not.toBeInTheDocument();
  });

  it("keeps a complete raw integral expression in one KaTeX fragment", () => {
    const { container } = render(<MathText text={String.raw`적분값은 \int_1^3\left(x^2-1\right)\,dx=2 이다.`} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(1);
    expect(screen.getByText("적분값은", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("이다.", { exact: false })).toBeInTheDocument();
  });

  it("supports adjacent raw commands and fractions without consuming ordinary paths", () => {
    const { container } = render(<MathText text={String.raw`2\times3, x\ge0, A\subset B https://example.com/times3 C:\\times3 /usr/bin/frac 3/4`} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(4);
    expect(screen.getByText(/https:\/\/example\.com\/times3/)).toBeInTheDocument();
    expect(container.querySelector("math mfrac")?.textContent).toBe("34");
  });
});
