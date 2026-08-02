import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { LinkifiedText } from "../../../utils/wikiLinks";
import ConceptLinkProvider from "./ConceptLinkProvider";

const entry = {
  id: "concept-entry", entryKind: "concept", subject: "수학", title: "미분", question: "", questionImages: [], difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], createdAt: "", updatedAt: "", learningBlocks: [{ id: "block", type: "concept", title: "도함수", content: "변화율", relatedConcepts: ["미분"] }],
} as unknown as WrongAnswerEntry;

function renderText(preferences: { conceptLinksEnabled: boolean; automaticConceptLinksEnabled: boolean }) {
  return render(<ConceptLinkProvider entries={[entry]} preferences={preferences as never} onOpenEntry={vi.fn()} onOpenLearningBlock={vi.fn()}><LinkifiedText text="[[도함수]]와 미분" onLinkClick={vi.fn()} existingTargets={new Set()} /></ConceptLinkProvider>);
}

describe("ConceptLinkProvider", () => {
  afterEach(cleanup);
  it("opens an indexed explicit concept link without changing its source text", () => {
    renderText({ conceptLinksEnabled: true, automaticConceptLinksEnabled: false });
    fireEvent.click(screen.getByRole("button", { name: "도함수" }));
    expect(screen.getByRole("dialog", { name: "도함수 개념 미리보기" })).toBeInTheDocument();
    expect(screen.getByText("변화율")).toBeInTheDocument();
  });

  it("renders saved wiki links as plain text when disabled", () => {
    renderText({ conceptLinksEnabled: false, automaticConceptLinksEnabled: false });
    expect(screen.queryByRole("button", { name: "도함수" })).not.toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.textContent === "도함수와 미분" ).length).toBeGreaterThan(0);
  });

  it("only creates automatic links when enabled", () => {
    render(<ConceptLinkProvider entries={[entry]} preferences={{ conceptLinksEnabled: true, automaticConceptLinksEnabled: true } as never} onOpenEntry={vi.fn()} onOpenLearningBlock={vi.fn()}><LinkifiedText text="도함수는 변화율이다." onLinkClick={vi.fn()} existingTargets={new Set()} /></ConceptLinkProvider>);
    expect(screen.getByRole("button", { name: "도함수" })).toBeInTheDocument();
  });
});
