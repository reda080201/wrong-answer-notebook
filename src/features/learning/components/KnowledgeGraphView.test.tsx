import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeEntity } from "../../../types";
import { SubjectDraftInput } from "./KnowledgeGraphView";

const entity = (subject = "수학"): KnowledgeEntity => ({
  id: "knowledge:derivative",
  type: "concept",
  name: "미분",
  aliases: [],
  subject,
  provenance: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("SubjectDraftInput", () => {
  it("keeps an editable local draft and commits the selected entity once on blur", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<SubjectDraftInput entity={entity()} onCommit={onCommit} />);

    const input = screen.getByPlaceholderText("전체 과목");
    fireEvent.change(input, { target: { value: "사회" } });
    expect(input).toHaveValue("사회");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("knowledge:derivative", "사회");
  });

  it("does not overwrite an unchanged subject draft", () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<SubjectDraftInput entity={entity()} onCommit={onCommit} />);

    fireEvent.blur(screen.getByPlaceholderText("전체 과목"));
    expect(onCommit).not.toHaveBeenCalled();
  });
});
