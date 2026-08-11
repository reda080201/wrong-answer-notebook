import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppSidebar from "./AppSidebar";

const baseProps = {
  activeSection: "wrong_answer" as const,
  entries: [],
  setActiveSection: vi.fn(),
  setSelectedId: vi.fn(),
  stats: { total: 0, pending: 0, difficult: 0 },
  learningStats: { recentReviewCount: 0, topCauses: [], weakConcepts: [] } as never,
  subjectOrder: [],
  subjectFilter: null,
  subjectCounts: {},
  sectionEntryCount: 0,
  moveSubject: vi.fn(),
  openNew: vi.fn(),
  openImport: vi.fn(),
  openLearningImport: vi.fn(),
  onSubjectSelect: vi.fn(),
};

describe("AppSidebar", () => {
  it("keeps every destination accessible in the collapsed icon rail", () => {
    render(
      <AppSidebar
        {...baseProps}
        collapsed
        onCollapsedChange={vi.fn()}
        onOpenLearningHub={vi.fn()}
        onOpenQuestionBank={vi.fn()}
        onOpenLibrary={vi.fn()}
      />,
    );

    for (const name of ["오답노트", "개념노트", "시험지함", "특강자료", "학습 허브", "문제 은행", "보관함"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
    expect(screen.queryByRole("button", { name: /새 오답/ })).not.toBeInTheDocument();
  });

  it("requests an independent restore without changing navigation", () => {
    const onCollapsedChange = vi.fn();
    render(<AppSidebar {...baseProps} collapsed onCollapsedChange={onCollapsedChange} />);

    fireEvent.click(screen.getByRole("button", { name: "앱 사이드바 펼치기" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
    expect(baseProps.setActiveSection).not.toHaveBeenCalled();
  });
});
