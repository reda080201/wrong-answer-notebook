import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EntryListPane from "./EntryListPane";
import type { EntryKind, WrongAnswerEntry } from "../types";
import * as questionMeta from "../utils/questionMeta";

function entry(
  id: string,
  entryKind: EntryKind,
  title: string,
  extra: Partial<WrongAnswerEntry> = {},
): WrongAnswerEntry {
  return {
    id,
    subject: "수학",
    title,
    question: "",
    questionImages: [],
    entryKind,
    difficult: false,
    difficulty: "none",
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [],
    memo: "",
    annotations: [],
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    mastered: false,
    ...extra,
  };
}

describe("EntryListPane", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders badges and previews for lecture/problem/concept/wrong_answer entries", () => {
    const entries = [
      entry("sheet", "problem_sheet", "시험지"),
      entry("concept", "concept", "개념", { question: "개념 요약" }),
      entry("lecture", "lecture", "특강", {
        learningBlocks: [{ id: "b", type: "concept", title: "함수", content: "그래프" }],
      }),
      entry("wrong", "wrong_answer", "오답"),
    ];

    render(
      <EntryListPane
        activeSection="lecture"
        loading={false}
        entries={entries}
        filtered={entries}
        selectedId="lecture"
        setSelectedId={vi.fn()}
        quickConceptSubject="수학"
        onQuickConceptCreate={vi.fn()}
      />,
    );

    expect(screen.getByText("문제지")).toBeInTheDocument();
    expect(screen.getAllByText("개념").length).toBeGreaterThan(0);
    expect(screen.getAllByText("특강").length).toBeGreaterThan(0);
    expect(screen.getByText("함수 그래프")).toBeInTheDocument();
    expect(screen.getByText("오답")).toBeInTheDocument();
  });

  it("selects an entry from click and keyboard", () => {
    const setSelectedId = vi.fn();
    render(
      <EntryListPane
        activeSection="wrong_answer"
        loading={false}
        entries={[entry("wrong", "wrong_answer", "오답")]}
        filtered={[entry("wrong", "wrong_answer", "오답")]}
        selectedId={null}
        setSelectedId={setSelectedId}
        quickConceptSubject="수학"
        onQuickConceptCreate={vi.fn()}
      />,
    );

    const card = screen.getByRole("button", { name: /오답/ });
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });

    expect(setSelectedId).toHaveBeenCalledWith("wrong");
    expect(setSelectedId).toHaveBeenCalledTimes(3);
  });

  it("shows only important sheet questions and opens the selected question", () => {
    const onOpenImportantQuestion = vi.fn();
    render(
      <EntryListPane
        activeSection="problem_sheet"
        loading={false}
        entries={[
          entry("sheet", "problem_sheet", "시험지", {
            questionMeta: [
              { questionNumber: "2", important: true, note: "다시 보기", updatedAt: "2026-01-01T00:00:00.000Z" },
              { questionNumber: "3", important: false, updatedAt: "2026-01-01T00:00:00.000Z" },
            ],
          }),
        ]}
        filtered={[]}
        selectedId={null}
        setSelectedId={vi.fn()}
        quickConceptSubject="수학"
        onQuickConceptCreate={vi.fn()}
        onOpenImportantQuestion={onOpenImportantQuestion}
      />,
    );

    expect(screen.getByRole("button", { name: "중요 문제만 복습 시작" })).toBeInTheDocument();
    expect(screen.getByText("문제 2")).toBeInTheDocument();
    expect(screen.queryByText("문제 3")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "바로 보기" }));
    expect(onOpenImportantQuestion).toHaveBeenCalledWith("sheet", "2");
  });

  it("memoizes important question derivation when entries are unchanged", () => {
    const normalizeSpy = vi.spyOn(questionMeta, "normalizeQuestionMeta");
    const entries = [
      entry("sheet", "problem_sheet", "시험지", {
        questionMeta: [
          { questionNumber: "2", important: true, updatedAt: "2026-01-01T00:00:00.000Z" },
        ],
      }),
    ];

    const { rerender } = render(
      <EntryListPane
        activeSection="problem_sheet"
        loading={false}
        entries={entries}
        filtered={[]}
        selectedId={null}
        setSelectedId={vi.fn()}
        quickConceptSubject="수학"
        onQuickConceptCreate={vi.fn()}
      />,
    );

    expect(normalizeSpy).toHaveBeenCalledTimes(1);

    rerender(
      <EntryListPane
        activeSection="problem_sheet"
        loading={false}
        entries={entries}
        filtered={[]}
        selectedId="sheet"
        setSelectedId={vi.fn()}
        quickConceptSubject="수학"
        onQuickConceptCreate={vi.fn()}
      />,
    );

    expect(normalizeSpy).toHaveBeenCalledTimes(1);
  });

  it("groups sheet parts into a folder card", () => {
    const setSelectedId = vi.fn();
    const part1 = entry("p1", "problem_sheet", "1~20", {
      question: "1. 하나\n\n2. 둘",
      sheetGroup: {
        groupId: "alpha",
        groupTitle: "ALPHA 모의고사 6회",
        partTitle: "1~20",
        partOrder: 1,
      },
    });
    const part2 = entry("p2", "problem_sheet", "21~40", {
      question: "1. 셋",
      sheetGroup: {
        groupId: "alpha",
        groupTitle: "ALPHA 모의고사 6회",
        partTitle: "21~40",
        partOrder: 2,
      },
    });

    render(
      <EntryListPane
        activeSection="problem_sheet"
        loading={false}
        entries={[part1, part2]}
        filtered={[part1, part2]}
        selectedId={null}
        setSelectedId={setSelectedId}
        quickConceptSubject="수학"
        onQuickConceptCreate={vi.fn()}
      />,
    );

    expect(screen.getByText("ALPHA 모의고사 6회")).toBeInTheDocument();
    expect(screen.getByText(/2개 파트/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1~20" }));
    expect(setSelectedId).toHaveBeenCalledWith("p1");
  });
});
