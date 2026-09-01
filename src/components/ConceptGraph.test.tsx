import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../types";
import ConceptGraph from "./ConceptGraph";

function conceptEntry(id: string, title: string, question = ""): WrongAnswerEntry {
  return {
    id, subject: "수학", title, question, questionImages: [], entryKind: "concept",
    difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "", explanationParts: [],
    memo: "", annotations: [], tags: [], createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z", mastered: false,
  };
}

describe("ConceptGraph", () => {
  it("opens an entry from Enter and Space", () => {
    const onOpenEntry = vi.fn();
    render(<ConceptGraph entries={[conceptEntry("entry-1", "함수"), conceptEntry("entry-2", "문제", "[[함수]]")]} onOpenEntry={onOpenEntry} />);

    const node = screen.getByRole("button", { name: "문제 항목 열기" });
    fireEvent.keyDown(node, { key: "Enter" });
    fireEvent.keyDown(node, { key: " " });

    expect(onOpenEntry).toHaveBeenNthCalledWith(1, "entry-2");
    expect(onOpenEntry).toHaveBeenNthCalledWith(2, "entry-2");
  });
});
