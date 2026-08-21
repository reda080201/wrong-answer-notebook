import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MathText from "./MathText";
import { tokenizeMathForDisplay } from "../utils/mathDisplay";

describe("MathText", () => {
  it("renders inline and display LaTeX with KaTeX", () => {
    const { container } = render(<MathText text={"값은 $x^2$이고 $$y=2x$$이다."} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector(".math-fragment--display")).toBeInTheDocument();
  });

  it("keeps invalid LaTeX as source text", () => {
    render(<MathText text={"잘못된 $\\notacommand{$ 수식"} />);
    expect(screen.getByRole("status", { name: "수식 형식 확인 필요" })).toHaveAttribute("data-math-source", "$\\notacommand{$ 수식");
    expect(screen.queryByText("$\\notacommand{$ 수식")).not.toBeInTheDocument();
  });

  it("keeps valid text around an invalid math segment", () => {
    render(<MathText text={"앞 문장 $$x^2$$ 중간 $$깨진 수식 뒤 문장"} />);
    expect(screen.getByText("앞 문장 ")).toBeInTheDocument();
    expect(screen.getByText(" 중간 ")).toBeInTheDocument();
    expect(screen.getByText("수식 형식 확인 필요")).toBeInTheDocument();
    expect(screen.getByText("뒤 문장")).toBeInTheDocument();
  });

  it("supports display math and raw times commands", () => {
    const { container } = render(<MathText text={"$$x^2$$ 그리고 \\times y"} />);
    expect(container.querySelector(".math-fragment--display .katex")).toBeInTheDocument();
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
  });

  it("marks orphan environment endings without hiding surrounding text", () => {
    render(<MathText text={"앞 \\end{cases} 뒤"} />);
    expect(screen.getByText("앞 ")).toBeInTheDocument();
    expect(screen.getByText("뒤")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "수식 형식 확인 필요" })).toHaveAttribute("data-math-source", "\\end{cases}");
  });

  it("does not rewrite source or interpret slash commands in URLs and paths", () => {
    const source = "https://example.com/frac C:/math/frac/file.tex /usr/local/frac/file 3/4 x/y /times";
    const segments = tokenizeMathForDisplay(source);
    expect(segments.filter((segment) => segment.type === "math")).toHaveLength(1);
    expect(segments.find((segment) => segment.type === "math")?.raw).toBe("\\times");
    expect(source).toContain("/frac");
  });
});
