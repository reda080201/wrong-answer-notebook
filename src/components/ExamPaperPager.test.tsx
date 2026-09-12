import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ExamPaperPager from "./ExamPaperPager";

describe("ExamPaperPager", () => {
  it("shows at most two questions and keeps short passage groups together", () => {
    render(<ExamPaperPager items={[
      { id: "q1", node: <p>1번</p>, groupId: "passage-a" },
      { id: "q2", node: <p>2번</p>, groupId: "passage-a" },
      { id: "q3", node: <p>3번</p> },
    ]} />);

    expect(screen.getByText("1번")).toBeInTheDocument();
    expect(screen.getByText("2번")).toBeInTheDocument();
    expect(screen.queryByText("3번")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("3번")).toBeInTheDocument();
    expect(screen.queryByText("1번")).not.toBeInTheDocument();
  });
});
