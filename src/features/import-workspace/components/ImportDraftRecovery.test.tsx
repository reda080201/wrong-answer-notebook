import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { loadImportWorkspaceDraft } from "../hooks/useImportWorkspaceAutosave";
import type { ImportWorkspace } from "../model/importWorkspace";
import ImportDraftRecovery from "./ImportDraftRecovery";
vi.mock("../hooks/useImportWorkspaceAutosave", () => ({ loadImportWorkspaceDraft: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it("ignores an earlier StrictMode read completing after the current read", async () => {
  let oldRead!: (value: ImportWorkspace | null) => void;
  vi.mocked(loadImportWorkspaceDraft).mockImplementationOnce(() => new Promise(resolve => { oldRead = resolve; })).mockResolvedValueOnce({ id: "new", groups: [] } as unknown as ImportWorkspace);
  render(<StrictMode><ImportDraftRecovery onResume={vi.fn()} /></StrictMode>);
  await screen.findByRole("button", { name: "이전 가져오기 이어서" });
  await act(async () => oldRead(null));
  expect(screen.getByRole("button", { name: "이전 가져오기 이어서" })).toBeEnabled();
});
const draft = { id: "existing-draft", groups: [], commitAttempt: { state: "completed" } } as unknown as ImportWorkspace;
it("opens a saved draft without new files and preserves its commit receipt", async () => {
  vi.mocked(loadImportWorkspaceDraft).mockResolvedValue(draft);
  const resume = vi.fn(async () => undefined);
  render(<ImportDraftRecovery onResume={resume} />);
  fireEvent.click(await screen.findByRole("button", { name: "이전 가져오기 이어서" }));
  await waitFor(() => expect(resume).toHaveBeenCalledWith(draft));
});
it("recovers a read failure, locking repeated clicks before the read completes", async () => {
  vi.mocked(loadImportWorkspaceDraft).mockRejectedValueOnce(new Error("read failure"));
  let resolve!: (value: ImportWorkspace) => void;
  vi.mocked(loadImportWorkspaceDraft).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const resume = vi.fn(async () => undefined);
  render(<ImportDraftRecovery onResume={resume} />);
  const retry = await screen.findByRole("button", { name: "이전 가져오기 다시 불러오기" });
  fireEvent.click(retry); fireEvent.click(retry);
  expect(loadImportWorkspaceDraft).toHaveBeenCalledTimes(2);
  resolve(draft);
  await waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
});
it("retains the recovery action when asset validation rejects the draft", async () => {
  vi.mocked(loadImportWorkspaceDraft).mockResolvedValue(draft);
  render(<ImportDraftRecovery onResume={async () => { throw new Error("원본 파일이 없습니다"); }} />);
  fireEvent.click(await screen.findByRole("button", { name: "이전 가져오기 이어서" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("원본 파일이 없습니다");
  expect(screen.getByRole("button", { name: "이전 가져오기 다시 불러오기" })).toBeEnabled();
});
