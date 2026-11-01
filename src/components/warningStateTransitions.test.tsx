import { StrictMode, useMemo } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../types";
import TextReviewPanel from "./TextReviewPanel";
import { useObjectUrlResources } from "../features/import/hooks/useObjectUrlResources";

const entry: WrongAnswerEntry = {
  id: "entry-1",
  subject: "수학",
  title: "문제",
  question: "기존 본문",
  questionImages: [],
  entryKind: "wrong_answer",
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
};

const suspiciousSegment = {
  id: "segment-1",
  start: 0,
  end: 3,
  text: "기존",
  reason: "OCR 의심 조각",
  severity: "high" as const,
};

function ObjectUrlPreview({ file }: { file: File }) {
  const items = useMemo(() => [{ key: "preview", file }], [file]);
  const previews = useObjectUrlResources(items);
  return <img data-testid="object-url-preview" src={previews.preview?.url ?? ""} alt="미리보기" />;
}

describe("warning state transitions", () => {
  it("applies same-entry refreshes to a pristine TextReviewPanel", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const view = render(<TextReviewPanel entry={entry} segments={[]} onClose={onClose} onSave={onSave} />);

    view.rerender(
      <TextReviewPanel
        entry={{ ...entry, question: "외부에서 갱신된 본문" }}
        segments={[]}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole("textbox", { name: "검수할 문제 텍스트" })).toHaveValue("외부에서 갱신된 본문");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("preserves dirty text and ignored segments until latest data is explicitly adopted", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const view = render(
      <TextReviewPanel entry={entry} segments={[suspiciousSegment]} onClose={onClose} onSave={onSave} />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "검수할 문제 텍스트" }), {
      target: { value: "사용자가 수정한 본문" },
    });
    fireEvent.click(screen.getByRole("button", { name: "이 구간 무시" }));

    view.rerender(
      <TextReviewPanel
        entry={{ ...entry, question: "최신 외부 본문" }}
        segments={[{ ...suspiciousSegment, text: "최신 의심 구간" }]}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole("textbox", { name: "검수할 문제 텍스트" })).toHaveValue("사용자가 수정한 본문");
    expect(screen.getByText("의심 구간이 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("외부에서 변경되었습니다");

    fireEvent.click(screen.getByRole("button", { name: "최신 내용 반영" }));

    expect(screen.getByRole("textbox", { name: "검수할 문제 텍스트" })).toHaveValue("최신 외부 본문");
    expect(screen.getByText("의심 구간 1개")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OCR 의심 조각: 최신 의심 구간" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("revokes StrictMode and replaced-file URLs and renders only the current file URL", () => {
    const createDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    let sequence = 0;
    const created: string[] = [];
    const revoked: string[] = [];
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => {
        const url = `blob:warning-test-${++sequence}`;
        created.push(url);
        return url;
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn((url: string) => revoked.push(url)),
    });
    try {
      const firstFile = new File(["first"], "first.png", { type: "image/png" });
      const secondFile = new File(["second"], "second.png", { type: "image/png" });
      const view = render(
        <StrictMode><ObjectUrlPreview file={firstFile} /></StrictMode>,
      );
      const firstActiveUrl = screen.getByTestId("object-url-preview").getAttribute("src");
      expect(firstActiveUrl).toBe(created.at(-1));
      expect(revoked).toContain(created[0]);

      view.rerender(<StrictMode><ObjectUrlPreview file={secondFile} /></StrictMode>);
      const secondActiveUrl = screen.getByTestId("object-url-preview").getAttribute("src");
      expect(secondActiveUrl).toBe(created.at(-1));
      expect(secondActiveUrl).not.toBe(firstActiveUrl);
      expect(revoked).toContain(firstActiveUrl);

      view.unmount();
      expect(revoked).toContain(secondActiveUrl);
    } finally {
      if (createDescriptor) Object.defineProperty(URL, "createObjectURL", createDescriptor);
      else Reflect.deleteProperty(URL, "createObjectURL");
      if (revokeDescriptor) Object.defineProperty(URL, "revokeObjectURL", revokeDescriptor);
      else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });
});
