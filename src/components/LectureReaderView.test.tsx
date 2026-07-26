import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getImageUrl } from "../api";
import type { WrongAnswerEntry } from "../types";
import LectureReaderView from "./LectureReaderView";

vi.mock("../api", () => ({
  getImageUrl: vi.fn(async (filename: string) => `mock://${filename}`),
}));

function lecture(): WrongAnswerEntry {
  return {
    id: "lecture-1",
    entryKind: "lecture",
    subject: "수학",
    title: "함수 특강",
    question: "특강 개요",
    questionImages: ["page.png"],
    sourcePageImages: ["source.png"],
    difficult: false,
    difficulty: "none",
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [],
    memo: "다시 볼 내용",
    annotations: [],
    tags: [],
    figures: [{ id: "figure-1", questionNumber: "", title: "연결 도형", caption: "도형 설명", image: "figure.png", source: "original" }],
    learningBlocks: [
      { id: "block-1", type: "concept", title: "첫 번째", content: "첫 내용", images: ["block.png"], figureIds: ["figure-1"] },
      { id: "block-2", type: "formula", title: "두 번째", content: "둘 내용" },
    ],
    linkedEntryIds: [],
    mastered: false,
    createdAt: "",
    updatedAt: "",
  };
}

describe("LectureReaderView", () => {
  it("renders the document in block order with linked and source images", async () => {
    render(<LectureReaderView entry={lecture()} onWikiLinkClick={vi.fn()} existingTargets={new Set()} />);

    expect(screen.getByRole("heading", { name: "특강 개요" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "복습 메모" })).toBeInTheDocument();
    expect(screen.getByText("다시 볼 내용")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1. 첫 번째" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. 두 번째" })).toBeInTheDocument();
    expect(screen.getByText("원본 자료")).toBeInTheDocument();
    expect(screen.queryByText("추가 도형")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(getImageUrl).toHaveBeenCalledWith("block.png");
      expect(getImageUrl).toHaveBeenCalledWith("page.png");
    });
  });

  it("keeps the card/document preference selectable", async () => {
    const onLayoutChange = vi.fn();
    render(<LectureReaderView entry={lecture()} onWikiLinkClick={vi.fn()} existingTargets={new Set()} layout="document" onLayoutChange={onLayoutChange} />);
    fireEvent.click(screen.getByRole("button", { name: "카드형" }));
    expect(onLayoutChange).toHaveBeenCalledWith("cards");
    await waitFor(() => expect(screen.getAllByRole("img").length).toBeGreaterThan(0));
  });
});
