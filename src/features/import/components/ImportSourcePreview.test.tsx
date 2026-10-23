import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StructuredQuestion } from "../../../types";
import ImportSourcePreview from "./ImportSourcePreview";
const question: StructuredQuestion = { questionNumber: "1", questionText: "문제", choices: [], conditions: [], equations: [], contentSegments: [], figureIds: [], source: { page: 2 } };
describe("original source panel", () => {
  it("loads only the linked page until the user opens other originals", async () => {
    const resolver = vi.fn(async (name: string) => `blob:${name}`);
    const view = render(<ImportSourcePreview question={question} draft={{ structuredQuestions: [question], sourcePageImages: ["page1.png", "page2.png"] }} resolveImageUrl={resolver} />);
    expect(await screen.findByAltText("연결된 원본")).toHaveAttribute("src", "blob:page2.png");
    expect(resolver).toHaveBeenCalledTimes(1);
    const details = screen.getByText("다른 원본 페이지 보기 (1개)").closest("details")!;
    details.open = true; fireEvent(details, new Event("toggle"));
    expect(await screen.findByAltText("자료 원본 페이지")).toHaveAttribute("src", "blob:page1.png");
    details.open = false; fireEvent(details, new Event("toggle"));
    await waitFor(() => expect(screen.queryByAltText("자료 원본 페이지")).not.toBeInTheDocument());
    view.unmount();
  });
});
