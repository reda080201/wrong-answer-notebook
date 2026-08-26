import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MathText from "./MathText";

describe("MathText", () => {
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
});
