import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MathText from "./MathText";

describe("MathText", () => {
  it("renders inline and display LaTeX with KaTeX", () => {
    const { container } = render(<MathText text={"값은 $x^2$이고 $$y=2x$$이다."} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector(".math-fragment--display")).toBeInTheDocument();
  });

  it("keeps invalid LaTeX non-destructive without exposing raw commands", () => {
    render(<MathText text={"잘못된 $\\notacommand{$ 수식"} />);
    expect(screen.getByText("수식 형식 확인 필요")).toBeInTheDocument();
    expect(screen.queryByText("$\\notacommand{$")).not.toBeInTheDocument();
  });

  it("normalizes a supported legacy command for display without treating fractions as separators", () => {
    const { container } = render(<MathText text={"/frac{3}{4}, x/y, 1/(x+1)"} />);
    expect(container.querySelector(".katex")).toBeInTheDocument();
    expect(container.textContent).toContain("x/y, 1/(x+1)");
  });
});
