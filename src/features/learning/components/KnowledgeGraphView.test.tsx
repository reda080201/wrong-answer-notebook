import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeEntity } from "../../../types";
import KnowledgeGraphView, { SubjectDraftInput } from "./KnowledgeGraphView";
import type { KnowledgeEntityUpdate } from "../../../hooks/useKnowledgeGraph";

vi.mock("../../../shared/ui/AppDialogProvider", () => ({ useAppDialog: () => ({ confirm: vi.fn(), prompt: vi.fn() }) }));

function AliasHarness({ failFirst = false }: { failFirst?: boolean }) {
  const [graph, setGraph] = useState({ entities: [{ ...entity(), aliases: ["원래 별칭", "보존할 별칭"] }], relations: [], questionLinks: [] });
  const failed = useRef(false);
  const update = async (id: string, patch: KnowledgeEntityUpdate) => {
    if (failFirst && !failed.current) { failed.current = true; throw new Error("별칭 저장 실패"); }
    setGraph(current => ({ ...current, entities: current.entities.map(item => item.id === id ? { ...item, ...(typeof patch === "function" ? patch(item) : patch) } : item) }));
  };
  return <><button onClick={() => setGraph(current => ({ ...current, entities: current.entities.map(item => ({ ...item, aliases: [...item.aliases, "새 별칭"], description: "새 설명" })) }))}>다른 편집</button>
    <KnowledgeGraphView graph={graph} questionBankItems={[]} onUpdateEntity={update} onEnsureEntity={async item => item} onCreateEntity={vi.fn()} onSaveRelation={vi.fn()} onSaveQuestionLink={vi.fn()} onRemoveRelation={vi.fn()} onRemoveQuestionLink={vi.fn()} onRemoveEntity={vi.fn()} onOpenQuestion={vi.fn()} onStartReview={vi.fn()} /></>;
}

describe("alias deletion and undo", () => {
  it("restores only the removed alias while preserving newer aliases and descriptions", async () => {
    render(<AliasHarness />);
    fireEvent.click(screen.getByRole("button", { name: "원래 별칭 별칭 삭제" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "원래 별칭 별칭 삭제" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByText("다른 편집"));
    fireEvent.click(screen.getByRole("button", { name: "별칭 삭제 실행 취소" }));
    await screen.findByRole("button", { name: "원래 별칭 별칭 삭제" });
    expect(screen.getByRole("button", { name: "새 별칭 별칭 삭제" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "보존할 별칭 별칭 삭제" })).toBeEnabled();
    expect(screen.getByText("새 설명")).toBeVisible();
  });
  it("preserves the alias after a save failure and retries deletion without duplicating it", async () => {
    render(<AliasHarness failFirst />);
    fireEvent.click(screen.getByRole("button", { name: "원래 별칭 별칭 삭제" }));
    await screen.findByText("별칭 저장 실패");
    expect(screen.getByRole("button", { name: "원래 별칭 별칭 삭제" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByRole("button", { name: "별칭 삭제 실행 취소" });
    expect(screen.queryByRole("button", { name: "원래 별칭 별칭 삭제" })).not.toBeInTheDocument();
  });
});

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
