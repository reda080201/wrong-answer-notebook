import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { ReviewItem, ReviewSession, WrongAnswerEntry } from "../types";
import AppModals from "./AppModals";
import { reviewSessionFingerprint } from "../features/review/storage/reviewSessionIdentity";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function entry(id: string): WrongAnswerEntry {
  return {
    id, subject: "수학", title: id, question: "1 + 1은?", questionImages: [], entryKind: "wrong_answer",
    difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "2", explanationParts: [{ id: "ex-1", text: "2", images: [] }],
    memo: "", annotations: [], tags: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", mastered: false,
  };
}

const entries = [entry("review-a"), entry("review-b")];
const items: ReviewItem[] = entries.map((item) => ({ kind: "entry", entry: item }));
const session: ReviewSession = {
  id: "old-session", mode: "random", seedFingerprint: reviewSessionFingerprint("random", items),
  itemRefs: entries.map((item) => ({ kind: "entry", entryId: item.id })), currentIndex: 1,
  completedItemKeys: ["entry:review-a"], reviewEvents: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:01:00.000Z",
};

function appProps(saveSession: (value: ReviewSession) => Promise<void>, setMode = vi.fn(), mode: "random" | null = "random") {
  return {
    workspaceActions: { registerDraftFlush: vi.fn() },
    form: { show: false, handleSave: vi.fn(), close: vi.fn(), activeSection: "wrong_answer", prefilledTitle: "" },
    settings: { value: {}, saveTemplate: vi.fn(), aiProviderStatus: null, setLastImportTemplate: vi.fn(), savePromptTemplate: vi.fn() },
    importFlow: { show: false, mode: "import", fallbackSubject: "기타", close: vi.fn(), apply: vi.fn(), applyEntries: vi.fn(async () => undefined) },
    learningImport: { show: false, setShow: vi.fn(), apply: vi.fn(async () => undefined) },
    review: { mode, seed: items, setMode, handle: vi.fn(async () => undefined), session, saveSession },
    navigation: { setActiveSection: vi.fn(), setSelectedId: vi.fn(), handleWikiLinkClick: vi.fn(), existingTargets: new Set<string>() },
    supplemental: {
      closeImport: vi.fn(), applyMerge: vi.fn(async () => undefined), closeManager: vi.fn(), rename: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined), closeLink: vi.fn(), linkCandidates: [], link: vi.fn(async () => undefined),
    },
  } as unknown as ComponentProps<typeof AppModals>;
}

function renderApp(saveSession: (value: ReviewSession) => Promise<void>, setMode = vi.fn(), mode: "random" | null = "random") {
  return render(<AppModals {...appProps(saveSession, setMode, mode)} />);
}

describe("AppModals review restart integration", () => {
  it("waits for the old session save, blocks duplicate actions and close, then renders ReviewPanel", async () => {
    const pending = deferred<void>();
    const saveSession = vi.fn((value: ReviewSession) => { void value; return pending.promise; });
    const setMode = vi.fn();
    renderApp(saveSession, setMode);

    const choiceDialog = screen.getByRole("dialog", { name: "복습 이어서 하기" });
    const restart = screen.getByRole("button", { name: "처음부터" });
    fireEvent.click(restart);
    expect(saveSession).toHaveBeenCalledTimes(1);
    expect(saveSession.mock.calls[0][0]).toMatchObject({ id: "old-session", abandonedAt: expect.any(String), completedItemKeys: ["entry:review-a"], reviewEvents: [] });
    expect(restart).toBeDisabled();
    expect(screen.getByRole("button", { name: "이어서 하기" })).toBeDisabled();
    expect(screen.queryByRole("dialog", { name: "랜덤 복습" })).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(choiceDialog.parentElement!);
    expect(setMode).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "복습 이어서 하기" })).toBeInTheDocument();

    await act(async () => { pending.resolve(); await pending.promise; });
    expect(await screen.findByRole("dialog", { name: "랜덤 복습" })).toBeInTheDocument();
    expect(saveSession).toHaveBeenCalledTimes(2);
  });

  it("keeps the resume dialog and original records after rejection, then permits retry", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const saveSession = vi.fn((value: ReviewSession): Promise<void> => { void value; return Promise.resolve(); }).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderApp(saveSession);

    fireEvent.click(screen.getByRole("button", { name: "처음부터" }));
    await act(async () => { first.reject(new Error("disk full")); try { await first.promise; } catch (error) { expect(error).toBeInstanceOf(Error); } });
    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    expect(screen.getByRole("dialog", { name: "복습 이어서 하기" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "랜덤 복습" })).not.toBeInTheDocument();
    expect(saveSession.mock.calls[0][0]).toMatchObject({ id: "old-session", completedItemKeys: ["entry:review-a"], reviewEvents: [] });

    fireEvent.click(screen.getByRole("button", { name: "처음부터" }));
    await act(async () => { second.resolve(); await second.promise; });
    expect(await screen.findByRole("dialog", { name: "랜덤 복습" })).toBeInTheDocument();
    expect(saveSession.mock.calls[1][0].id).toBe("old-session");
    expect(saveSession.mock.calls[2][0].id).not.toBe("old-session");
  });

  it("resumes the existing session without marking it abandoned", async () => {
    const saveSession = vi.fn(async (value: ReviewSession) => { void value; });
    renderApp(saveSession);
    fireEvent.click(screen.getByRole("button", { name: "이어서 하기" }));
    expect(await screen.findByRole("dialog", { name: "랜덤 복습" })).toBeInTheDocument();
    await waitFor(() => expect(saveSession).toHaveBeenCalled());
    expect(saveSession.mock.calls[0][0]).toMatchObject({ id: "old-session", completedItemKeys: ["entry:review-a"] });
    expect(saveSession.mock.calls[0][0]).not.toHaveProperty("abandonedAt");
  });

  it("does not open a stale review panel after the review identity changes during a pending save", async () => {
    const pending = deferred<void>();
    const saveSession = vi.fn(() => pending.promise);
    const setMode = vi.fn();
    const view = renderApp(saveSession, setMode);
    fireEvent.click(screen.getByRole("button", { name: "처음부터" }));
    view.rerender(<AppModals {...appProps(saveSession, setMode, null)} />);
    await act(async () => { pending.resolve(); await pending.promise; });
    expect(screen.queryByRole("dialog", { name: "랜덤 복습" })).not.toBeInTheDocument();
  });
});
