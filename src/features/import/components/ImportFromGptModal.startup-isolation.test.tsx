import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImportFromGptModal from "./ImportFromGptModal";

const {
  createMcpBridgePairing,
  invoke,
  setMcpBridgeEnabled,
  syncMcpBridgeActiveContext,
  syncMcpBridgeActiveExamContext,
  syncMcpBridgeExportContext,
} = vi.hoisted(() => ({
  createMcpBridgePairing: vi.fn(),
  invoke: vi.fn(),
  setMcpBridgeEnabled: vi.fn(),
  syncMcpBridgeActiveContext: vi.fn(),
  syncMcpBridgeActiveExamContext: vi.fn(),
  syncMcpBridgeExportContext: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

vi.mock("../../../api", () => ({
  deleteImage: vi.fn().mockResolvedValue(undefined),
  saveImageFiles: vi.fn().mockResolvedValue([]),
  createMcpBridgePairing,
  setMcpBridgeEnabled,
  syncMcpBridgeActiveContext,
  syncMcpBridgeActiveExamContext,
  syncMcpBridgeExportContext,
}));

function renderModal() {
  return render(
    <ImportFromGptModal
      fallbackSubject="수학"
      onClose={vi.fn()}
      onApply={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  );
}

describe("ImportFromGptModal startup isolation", () => {
  let originalWindowOpen: typeof window.open;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWindowOpen = window.open;
    window.open = vi.fn() as unknown as typeof window.open;
  });

  afterEach(() => {
    window.open = originalWindowOpen;
  });

  it("does not enable, pair, sync MCP, invoke Tauri commands, or open a native window when rendered", () => {
    renderModal();

    expect(screen.getByRole("dialog", { name: "GPT 결과 가져오기" })).toBeInTheDocument();
    expect(setMcpBridgeEnabled).not.toHaveBeenCalled();
    expect(createMcpBridgePairing).not.toHaveBeenCalled();
    expect(syncMcpBridgeActiveContext).not.toHaveBeenCalled();
    expect(syncMcpBridgeActiveExamContext).not.toHaveBeenCalled();
    expect(syncMcpBridgeExportContext).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("keeps the isolation boundary when the modal is opened with solution context and AI settings", () => {
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
        sourceEntry={{
          id: "entry-1",
          subject: "수학",
          title: "방정식",
          question: "x + 1 = 2",
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
        }}
        mode="solution"
        aiProvider={{ type: "gemini-flash-lite", enabled: true, keySource: "env", hasStoredKey: false }}
        aiProviderStatus={{
          type: "gemini-flash-lite",
          enabled: true,
          keySource: "env",
          hasStoredKey: false,
          hasEnvKey: true,
          available: true,
        }}
      />,
    );

    expect(screen.getByRole("dialog", { name: "GPT 해설 빠른 가져오기" })).toBeInTheDocument();
    expect(setMcpBridgeEnabled).not.toHaveBeenCalled();
    expect(createMcpBridgePairing).not.toHaveBeenCalled();
    expect(syncMcpBridgeActiveContext).not.toHaveBeenCalled();
    expect(syncMcpBridgeActiveExamContext).not.toHaveBeenCalled();
    expect(syncMcpBridgeExportContext).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});
