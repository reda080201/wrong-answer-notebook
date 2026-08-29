import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppToolbar from "./AppToolbar";

describe("AppToolbar", () => {
  it("routes search, sort, difficulty, and review callbacks", () => {
    const setSearch = vi.fn();
    const setSortKey = vi.fn();
    const setDifficultyFilter = vi.fn();
    const setDifficultyScoreFilter = vi.fn();
    const setListFilter = vi.fn();
    const startReview = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <AppToolbar
        activeSection="problem_sheet"
        search=""
        setSearch={setSearch}
        sortKey="date-desc"
        setSortKey={setSortKey}
        difficultyFilter="all"
        setDifficultyFilter={setDifficultyFilter}
        difficultyScoreFilter="all"
        setDifficultyScoreFilter={setDifficultyScoreFilter}
        listFilter="all"
        setListFilter={setListFilter}
        todayReviewCount={2}
        startReview={startReview}
        onOpenSettings={onOpenSettings}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("문제, 답, 태그로 검색…"), {
      target: { value: "함수" },
    });
    fireEvent.change(screen.getByLabelText("정렬"), {
      target: { value: "title-asc" },
    });
    expect(screen.queryByLabelText("난이도 필터")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("난이도 점수 필터"), {
      target: { value: "very-hard" },
    });
    fireEvent.click(screen.getByRole("button", { name: "복습 필요" }));
    fireEvent.click(screen.getByRole("button", { name: "복습 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "중요 문제 복습" }));
    fireEvent.click(screen.getByRole("button", { name: /설정/ }));

    expect(setSearch).toHaveBeenCalledWith("함수");
    expect(setSortKey).toHaveBeenCalledWith("title-asc");
    expect(setDifficultyFilter).not.toHaveBeenCalled();
    expect(setDifficultyScoreFilter).toHaveBeenCalledWith("very-hard");
    expect(setListFilter).toHaveBeenCalledWith("pending");
    expect(startReview).toHaveBeenCalledWith("important");
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
