import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryFolder, WrongAnswerEntry } from "../../../types";
import LibraryExplorer from "./LibraryExplorer";

const folders: LibraryFolder[] = [
  { id: "math", name: "수학", sortOrder: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  { id: "algebra", name: "대수", parentId: "math", sortOrder: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  { id: "geometry", name: "기하", sortOrder: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
];

const entry = (id: string, title: string, folderId?: string) => ({
  id,
  title,
  folderId,
  subject: "수학",
  question: "문제",
  questionImages: [],
  entryKind: "wrong_answer",
  difficult: false,
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  mastered: false,
} as unknown as WrongAnswerEntry);

const defaultProps = () => ({
  folders,
  entries: [entry("root-entry", "루트 문항"), entry("missing-entry", "미분류 문항", "deleted-folder"), entry("folder-entry", "수학 문항", "math")],
  onOpenEntry: vi.fn(),
  onCreateFolder: vi.fn(),
  onRenameFolder: vi.fn(),
  onMoveFolder: vi.fn(),
  onMoveEntries: vi.fn(),
  onDeleteFolder: vi.fn(),
});

describe("LibraryExplorer", () => {
  it("shows only entries without a valid folder in the unclassified view", () => {
    render(<LibraryExplorer {...defaultProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "미분류 항목" }));

    expect(screen.getByRole("heading", { name: "미분류 항목" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /루트 문항/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /미분류 문항/ })).toBeInTheDocument();
    expect(screen.getByText("미분류 문항")).toBeInTheDocument();
    expect(screen.queryByText("수학 문항")).not.toBeInTheDocument();
  });

  it("supports tree expansion, collapse, navigation and focus synchronization", () => {
    render(<LibraryExplorer {...defaultProps()} />);
    const tree = screen.getByRole("tree");
    const math = screen.getByRole("treeitem", { name: /수학/ });

    expect(math).toHaveAttribute("tabindex", "0");

    math.focus();
    fireEvent.keyDown(math, { key: "ArrowRight" });
    expect(math).toHaveAttribute("aria-expanded", "true");
    const algebra = screen.getAllByRole("treeitem").find((item) => item.getAttribute("aria-level") === "2");
    if (!algebra) throw new Error("대수 폴더 treeitem이 없습니다.");

    fireEvent.keyDown(math, { key: "ArrowDown" });
    expect(document.activeElement).toBe(algebra);

    fireEvent.keyDown(algebra, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(math);
    expect(math).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(math, { key: "ArrowLeft" });
    expect(math).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(math, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("treeitem", { name: /기하/ }));

    fireEvent.keyDown(screen.getByRole("treeitem", { name: /기하/ }), { key: "Home" });
    expect(document.activeElement).toBe(math);
    expect(tree).toHaveAttribute("role", "tree");
    expect(math).toHaveAttribute("aria-level", "1");
  });
});
