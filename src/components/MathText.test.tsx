import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MathText from "./MathText";

describe("MathText", () => {
  it("renders inline and display LaTeX with KaTeX", () => {
    const { container } = render(<MathText text={"값은 $x^2$이고 $$y=2x$$이다."} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector(".math-fragment--display")).toBeInTheDocument();
  });

  it("keeps invalid LaTeX as source text", () => {
    render(<MathText text={"잘못된 $\\notacommand{$ 수식"} />);
    expect(screen.getByText("$\\notacommand{$")).toBeInTheDocument();
  });

  it("hides malformed delimiters behind a non-destructive warning", () => {
    render(<MathText text="본문 $$x^2" />);
    expect(screen.getByText("수식 형식 확인 필요")).toBeInTheDocument();
    expect(screen.getByText("본문 $$x^2")).not.toBeVisible();
  });
});
