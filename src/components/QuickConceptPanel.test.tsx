import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QuickConceptPanel, { createQuickConceptData } from "./QuickConceptPanel";

describe("QuickConceptPanel", () => {
  it("creates a concept entry from title, summary, and tags", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<QuickConceptPanel subject="수학" onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText("빠른 개념명"), {
      target: { value: "이차함수" },
    });
    fireEvent.change(screen.getByLabelText("빠른 개념 요약"), {
      target: { value: "꼭짓점과 축을 먼저 확인" },
    });
    fireEvent.change(screen.getByLabelText("빠른 개념 태그"), {
      target: { value: "함수, 그래프 #중요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entryKind: "concept",
          subject: "수학",
          title: "이차함수",
          question: "꼭짓점과 축을 먼저 확인",
          tags: ["함수", "그래프", "중요"],
          checklist: [],
          difficulty: "none",
        }),
      );
    });
  }, 10000);

  it("clears fields after a successful create", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<QuickConceptPanel subject="국어" onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText("빠른 개념명"), {
      target: { value: "비유법" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    await waitFor(() => {
      expect(screen.getByLabelText("빠른 개념명")).toHaveValue("");
    });
  });

  it("keeps the create button disabled for empty input", () => {
    render(<QuickConceptPanel subject="기타" onCreate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
  });

  it("uses the summary as title when the title is empty", () => {
    expect(createQuickConceptData("", "등식의 성질을 이용", "", "수학")).toEqual(
      expect.objectContaining({
        title: "등식의 성질을 이용",
        question: "등식의 성질을 이용",
      }),
    );
  });
});
