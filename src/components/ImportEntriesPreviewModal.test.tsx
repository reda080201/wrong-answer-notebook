import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ImportedStudyDocument } from "../utils/importStudyText";
import ImportEntriesPreviewModal from "./ImportEntriesPreviewModal";

describe("ImportEntriesPreviewModal", () => {
  it("summarizes and applies every entry in a mixed document", async () => {
    const document: ImportedStudyDocument = {
      schemaVersion: "wrong-answer-notebook-import-v2",
      importType: "mixed",
      title: "혼합 가져오기",
      subject: "수학",
      entries: [
        {
          entryKind: "problem_sheet",
          title: "시험지",
          subject: "수학",
          question: "1. 문제",
          answerKey: [],
          figures: [],
          learningBlocks: [],
        },
        {
          entryKind: "lecture",
          title: "극한 특강",
          subject: "수학",
          question: "",
          learningBlocks: [{ id: "block-1", type: "concept", title: "극한", content: "정의" }],
        },
      ],
    };
    const onApplyEntries = vi.fn().mockResolvedValue(undefined);
    render(
      <ImportEntriesPreviewModal
        document={document}
        onClose={vi.fn()}
        onApplyEntries={onApplyEntries}
      />,
    );

    expect(screen.getByText("혼합 가져오기")).toBeInTheDocument();
    expect(screen.getAllByText("시험지")).toHaveLength(2);
    expect(screen.getByText("극한 특강")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2개 항목 저장" }));
    await waitFor(() => expect(onApplyEntries).toHaveBeenCalledWith(document.entries));
  });
});
