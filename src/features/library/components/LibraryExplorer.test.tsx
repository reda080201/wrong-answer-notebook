import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryFolder, WrongAnswerEntry } from "../../../types";
import LibraryExplorer from "./LibraryExplorer";

const folders: LibraryFolder[] = [{ id: "math", name: "수학 폴더", sortOrder: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
const entry = (id: string, title: string, partial: Partial<WrongAnswerEntry> = {}): WrongAnswerEntry => ({ id, title, subject: "수학", question: "문제", questionImages: [], entryKind: "problem_sheet", difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], createdAt: "2026-01-01", updatedAt: "2026-01-02", mastered: false, ...partial });

function props(entries: WrongAnswerEntry[] = [entry("one", "미분", { resourceClassification: { subject: "수학", course: "수학 II", unit: "미분", resourceType: "nset" } })]) {
  return { folders, entries, onOpenEntry: vi.fn(), onCreateFolder: vi.fn(), onRenameFolder: vi.fn(), onMoveFolder: vi.fn(), onMoveEntries: vi.fn(), onDeleteFolder: vi.fn() };
}

describe("LibraryExplorer", () => {
  it("navigates subject, course, unit and resource group as lists", () => {
    render(<LibraryExplorer {...props()} />);
    fireEvent.click(screen.getByRole("navigation", { name: "과목 목록" }).querySelector("button")!);
    fireEvent.click(screen.getByRole("button", { name: /수학 II/ }));
    fireEvent.click(screen.getByRole("button", { name: /^미분\s*1개 자료$/ }));
    fireEvent.click(screen.getByRole("button", { name: "전체 자료 보기" }));
    expect(screen.getByRole("button", { name: /미분.*N제/ })).toBeInTheDocument();
  });

  it("keeps metadata-free legacy entries visible as unclassified", () => {
    render(<LibraryExplorer {...props([entry("legacy", "옛 자료", { resourceClassification: undefined })])} />);
    expect(screen.getByText("옛 자료")).toBeInTheDocument();
    expect(screen.getByText("미분류")).toBeInTheDocument();
  });

  it("preserves folder navigation and actions", () => {
    const handlers = props();
    render(<LibraryExplorer {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: "수학 폴더" }));
    expect(screen.getByText("단원 탐색으로 돌아가기")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "새 폴더" }));
    expect(handlers.onCreateFolder).toHaveBeenCalledWith("math");
  });

  it("renders file mode and persists favorite without opening the entry", async () => {
    const handlers = { ...props(), onUpdateEntries: vi.fn().mockResolvedValue(undefined) };
    render(<LibraryExplorer {...handlers} preferences={{ separateMockExams: false, defaultUnitView: "home", listDensity: "standard", showUserFolders: true, displayMode: "file" }} />);
    expect(screen.getByText("미분").closest(".library-file-open")).toHaveAttribute("title", "미분");
    fireEvent.click(screen.getByRole("button", { name: "즐겨찾기에 추가" }));
    expect(handlers.onOpenEntry).not.toHaveBeenCalled();
    await waitFor(() => expect(handlers.onUpdateEntries).toHaveBeenCalledWith(["one"], { libraryFavorite: true }));
  });

  it("defaults to standard mode for legacy preferences", () => {
    render(<LibraryExplorer {...props()} preferences={{ separateMockExams: false, defaultUnitView: "home", listDensity: "standard", showUserFolders: true }} />);
    expect(screen.queryByRole("button", { name: "즐겨찾기에 추가" })).not.toBeInTheDocument();
  });

  it("persists the selected unit and section through the navigation callback", () => {
    const handlers = { ...props(), onNavigationChange: vi.fn() };
    render(<LibraryExplorer {...handlers} navigation={{ subject: "수학", course: "수학 II" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^미분\s*1개 자료$/ }));
    expect(handlers.onNavigationChange).toHaveBeenLastCalledWith({
      subject: "수학",
      course: "수학 II",
      unit: "미분",
      group: "all",
    });
  });
});
