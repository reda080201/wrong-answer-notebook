import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useNotebookNavigationController } from "./useNotebookNavigationController";

describe("useNotebookNavigationController", () => {
  it("closes an active exam before changing section", async () => {
    const closeExamSession = vi.fn(async () => true);
    const setActiveSection = vi.fn();
    const setSelectedId = vi.fn();
    const setShowLearningHub = vi.fn();
    const setShowQuestionBank = vi.fn();
    const setShowLibraryExplorer = vi.fn();
    const setQuestionTarget = vi.fn();
    const setExamSaveError = vi.fn();
    const { result } = renderHook(() => useNotebookNavigationController({
      activeSection: "problem_sheet",
      examSubmitting: false,
      examSession: { entryId: "entry-1" },
      closeExamSession,
      setActiveSection,
      setSelectedId,
      setShowLearningHub,
      setShowQuestionBank,
      setShowLibraryExplorer,
      setQuestionTarget,
      setExamSaveError,
    }));

    await expect(result.current({ section: "lecture", entryId: "entry-2" })).resolves.toBe(true);

    expect(closeExamSession).toHaveBeenCalledOnce();
    expect(setActiveSection).toHaveBeenCalledWith("lecture");
    expect(setSelectedId).toHaveBeenCalledWith("entry-2");
  });

  it("blocks navigation while an exam is submitting", async () => {
    const setExamSaveError = vi.fn();
    const { result } = renderHook(() => useNotebookNavigationController({
      activeSection: "problem_sheet",
      examSubmitting: true,
      examSession: null,
      closeExamSession: vi.fn(async () => true),
      setActiveSection: vi.fn(),
      setSelectedId: vi.fn(),
      setShowLearningHub: vi.fn(),
      setShowQuestionBank: vi.fn(),
      setShowLibraryExplorer: vi.fn(),
      setQuestionTarget: vi.fn(),
      setExamSaveError,
    }));

    await expect(result.current({ section: "lecture" })).resolves.toBe(false);
    expect(setExamSaveError).toHaveBeenCalledWith("시험 제출 중에는 이동할 수 없습니다.");
  });
});
