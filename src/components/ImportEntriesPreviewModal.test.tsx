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
    const details = screen.queryByText(/검토 권장 항목 .* 보기/);
    if (details) fireEvent.click(details);
    fireEvent.click(screen.getByRole("button", { name: "2개 항목 저장" }));
    await waitFor(() => expect(onApplyEntries).toHaveBeenCalledWith(document.entries));
  });

  it("distinguishes blockedRowCount and blockingIssueCount when an entry has multiple blocking issues", () => {
    const document: ImportedStudyDocument = {
      schemaVersion: "wrong-answer-notebook-import-v2",
      importType: "mixed",
      title: "차단 검사",
      subject: "수학",
      entries: [
        {
          entryKind: "wrong_answer",
          title: "정상 문항",
          subject: "수학",
          question: "정상 문제",
        },
        {
          entryKind: "problem_sheet",
          title: "오류 문항",
          subject: "수학",
          question: "1. 문제",
          questionSourceCrops: [
            { questionNumber: "1", image: "crop.png", cropRect: { x: 0.8, y: 0, width: 0.4, height: 0.5 } },
          ],
          figures: [
            {
              id: "figure-1",
              questionNumber: "1",
              title: "도형",
              caption: "",
              source: "original",
              original: { image: "original.png", crop: { x: -0.1, y: 0, width: 0.5, height: 0.5 } },
            },
          ],
        },
      ],
    };

    render(
      <ImportEntriesPreviewModal
        document={document}
        onClose={vi.fn()}
        onApplyEntries={vi.fn()}
      />,
    );

    // Blocked row count is 1, blocking issues count is 2
    expect(
      screen.getByText(/적용 불가 항목 1개\(차단 이슈 2개\)는 이번 저장에서 제외됩니다/),
    ).toBeInTheDocument();

    // Check footer counts
    expect(
      screen.getByText(/전체 2개 · 저장 1개 · 확인 필요 1개 · 적용 불가 1개 · 직접 제외 0개/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1개 항목 저장" })).toBeInTheDocument();
  });

  it("updates counts when user excludes an entry and toggles it back", () => {
    const document: ImportedStudyDocument = {
      schemaVersion: "wrong-answer-notebook-import-v2",
      importType: "mixed",
      title: "제외 토글 검사",
      subject: "수학",
      entries: [
        { entryKind: "wrong_answer", title: "항목 1", subject: "수학", question: "문제 1" },
        { entryKind: "wrong_answer", title: "항목 2", subject: "수학", question: "문제 2" },
      ],
    };

    render(
      <ImportEntriesPreviewModal
        document={document}
        onClose={vi.fn()}
        onApplyEntries={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "2개 항목 저장" })).toBeInTheDocument();

    const excludeButtons = screen.getAllByRole("button", { name: "이 항목 제외" });
    fireEvent.click(excludeButtons[0]);

    expect(
      screen.getByText(/전체 2개 · 저장 1개 · 확인 필요 0개 · 적용 불가 0개 · 직접 제외 1개/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1개 항목 저장" })).toBeInTheDocument();

    // Toggle back
    const includeButton = screen.getByRole("button", { name: "저장 대상에 다시 포함" });
    fireEvent.click(includeButton);

    expect(
      screen.getByText(/전체 2개 · 저장 2개 · 확인 필요 0개 · 적용 불가 0개 · 직접 제외 0개/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2개 항목 저장" })).toBeInTheDocument();
  });

  it("filters assetFiles to only those referenced by included entries", async () => {
    const file1 = new File(["img1"], "item1_figure.png", { type: "image/png" });
    const file2 = new File(["img2"], "item2_figure.png", { type: "image/png" });

    const document: ImportedStudyDocument = {
      schemaVersion: "wrong-answer-notebook-import-v2",
      importType: "mixed",
      title: "에셋 필터링 검사",
      subject: "수학",
      entries: [
        {
          entryKind: "wrong_answer",
          title: "포함 항목",
          subject: "수학",
          question: "문제 1",
          questionImages: ["item1_figure.png"],
        },
        {
          entryKind: "wrong_answer",
          title: "제외할 항목",
          subject: "수학",
          question: "문제 2",
          questionImages: ["item2_figure.png"],
        },
      ],
      assetFiles: [file1, file2],
    };

    const onApplyEntries = vi.fn().mockResolvedValue(undefined);
    render(
      <ImportEntriesPreviewModal
        document={document}
        onClose={vi.fn()}
        onApplyEntries={onApplyEntries}
      />,
    );

    // Exclude the second entry
    const excludeButtons = screen.getAllByRole("button", { name: "이 항목 제외" });
    fireEvent.click(excludeButtons[1]);

    fireEvent.click(screen.getByRole("button", { name: "1개 항목 저장" }));

    await waitFor(() => {
      expect(onApplyEntries).toHaveBeenCalledTimes(1);
    });

    const [appliedEntries, appliedAssets] = onApplyEntries.mock.calls[0];
    expect(appliedEntries).toHaveLength(1);
    expect(appliedEntries[0].title).toBe("포함 항목");
    expect(appliedAssets).toHaveLength(1);
    expect(appliedAssets[0].name).toBe("item1_figure.png");
  });
});
