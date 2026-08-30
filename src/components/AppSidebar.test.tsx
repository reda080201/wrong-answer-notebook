import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppSidebar from "./AppSidebar";

const baseProps = {
  navigationController: {
    activeSection: "wrong_answer" as const,
    selectedId: null,
    requestNavigation: vi.fn(async () => true),
    selectSection: vi.fn(async () => true),
    selectEntry: vi.fn(async () => true),
    openQuestion: vi.fn(async () => true),
    openLearningHub: vi.fn(async () => true),
    openQuestionBank: vi.fn(async () => true),
    openLibrary: vi.fn(async () => true),
  },
  activeSection: "wrong_answer" as const,
  entries: [],
  stats: { total: 0, pending: 0, difficult: 0 },
  learningStats: { recentReviewCount: 0, topCauses: [], weakConcepts: [] } as never,
  subjects: { order: [], filter: null, counts: {}, sectionEntryCount: 0, move: vi.fn(), select: vi.fn() },
  actions: { openNew: vi.fn(), openImport: vi.fn(), openLearningImport: vi.fn() },
  destination: { type: "section" as const, section: "wrong_answer" as const },
  shell: { collapsed: false, onCollapsedChange: vi.fn() },
};

describe("AppSidebar", () => {
  it("keeps every destination accessible in the collapsed icon rail", () => {
    render(
      <AppSidebar
        {...baseProps}
        shell={{ collapsed: true, onCollapsedChange: vi.fn() }}
      />,
    );

    for (const name of ["오답노트", "개념노트", "시험지함", "특강자료", "학습 허브", "문제 은행", "보관함"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
    expect(screen.queryByRole("button", { name: /새 오답/ })).not.toBeInTheDocument();
  });

  it("requests an independent restore without changing navigation", () => {
    const onCollapsedChange = vi.fn();
    render(<AppSidebar {...baseProps} shell={{ collapsed: true, onCollapsedChange }} />);

    fireEvent.click(screen.getByRole("button", { name: "앱 사이드바 펼치기" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
    expect(baseProps.navigationController.requestNavigation).not.toHaveBeenCalled();
  });

  it.each([
    ["learning_hub", "학습 허브"],
    ["question_bank", "문제 은행"],
    ["library", "보관함"],
  ] as const)("exposes exactly one active destination for %s", (type, label) => {
    render(<AppSidebar {...baseProps} destination={{ type }} />);

    expect(screen.getAllByRole("button", { current: "page" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: label, current: "page" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /새 오답/ })).not.toBeInTheDocument();
  });
});
