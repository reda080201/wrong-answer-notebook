import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConceptImportPreviewModal from "./ConceptImportPreviewModal";

const nested = {
  title: "생활과 윤리",
  note: "일부 단원만 포함",
  scope: { subject: "사회" },
  units: [
    {
      unitName: "1단원",
      examCore: "윤리학 구분",
      commonTraps: ["개념 혼동"],
      chapters: [
        {
          chapterName: "윤리학",
          concepts: [
            { name: "윤리학", definition: "옳고 그름 탐구", examPoints: ["규범 윤리 구분"] },
          ],
        },
      ],
    },
  ],
};

describe("ConceptImportPreviewModal", () => {
  it("defaults to concept split mode and applies converted entries", async () => {
    const onApplyEntries = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ConceptImportPreviewModal
        value={nested}
        fallbackSubject="기타"
        onClose={onClose}
        onApplyEntries={onApplyEntries}
      />,
    );

    expect(screen.getByRole("button", { name: "개념노트 여러 개로 분리" })).toHaveClass("active");
    expect(screen.getByText(/일부 단원/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "윤리학" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "변환해서 저장" }));

    await waitFor(() => expect(onApplyEntries).toHaveBeenCalled());
    expect(onApplyEntries.mock.calls[0][0][0]).toEqual(expect.objectContaining({
      entryKind: "concept",
      title: "윤리학",
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it("switches to unit lecture mode", () => {
    render(
      <ConceptImportPreviewModal
        value={nested}
        fallbackSubject="기타"
        onClose={vi.fn()}
        onApplyEntries={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "단원별 특강자료로 저장" }));

    expect(screen.getByText(/단원별 특강자료로 저장 · 1개 생성 예정/)).toBeInTheDocument();
  });
});
