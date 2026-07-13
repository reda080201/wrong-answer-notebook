import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../api";
import {
  DEFAULT_MCP_BRIDGE_SETTINGS,
  MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE,
} from "../hooks/useMcpBridgeSettings";
import SettingsModal from "./SettingsModal";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
}));

function renderSettingsModal(overrides: Record<string, unknown> = {}) {
  const props = {
    settings: defaultSettings,
    settingsError: null,
    settingsMessage: null,
    clearSettingsError: vi.fn(),
    setSettingsMessage: vi.fn(),
    setSettings: vi.fn().mockResolvedValue(undefined),
    theme: "system" as const,
    setTheme: vi.fn(),
    aiProviderStatus: null,
    aiProviderKeyInput: "",
    setAiProviderKeyInput: vi.fn(),
    updateAiProviderConfig: vi.fn().mockResolvedValue(undefined),
    storeAiProviderKey: vi.fn().mockResolvedValue(undefined),
    removeAiProviderKey: vi.fn().mockResolvedValue(undefined),
    integrityReport: null,
    saveTemplate: vi.fn().mockResolvedValue(undefined),
    deleteTemplate: vi.fn().mockResolvedValue(undefined),
    savePromptTemplate: vi.fn().mockResolvedValue(undefined),
    deletePromptTemplate: vi.fn().mockResolvedValue(undefined),
    deleteMemoTemplate: vi.fn().mockResolvedValue(undefined),
    handleBackup: vi.fn().mockResolvedValue(undefined),
    handleRestore: vi.fn().mockResolvedValue(undefined),
    runIntegrity: vi.fn().mockResolvedValue(undefined),
    handleCleanupOrphans: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };

  return render(<SettingsModal {...props} />);
}

describe("SettingsModal MCP bridge tab", () => {
  it("shows Korean bridge controls disabled by default in browser mode", () => {
    renderSettingsModal();

    fireEvent.click(screen.getByRole("button", { name: "고급" }));

    expect(screen.getByText("MCP 브릿지", { selector: "p.settings-label" })).toBeInTheDocument();
    expect(screen.getByText(MCP_BRIDGE_BROWSER_BLOCKED_MESSAGE)).toBeInTheDocument();

    const enableToggle = screen.getByRole("checkbox", { name: /MCP 브릿지 사용/ });
    expect(enableToggle).not.toBeChecked();
    expect(enableToggle).toBeDisabled();

    expect(screen.getByLabelText("포트")).toHaveValue(DEFAULT_MCP_BRIDGE_SETTINGS.port);
    expect(screen.getByLabelText("포트")).toBeDisabled();
    expect(screen.getByText(/상태:/)).toHaveTextContent("꺼짐");
    expect(screen.getByText(/읽기 전용:/)).toHaveTextContent("예");
    expect(screen.getByText(/연결 테스트:/)).toHaveTextContent("아직 실행하지 않음");
  });

  it("renders runtime status, port, and connection test result", () => {
    renderSettingsModal({
      mcpBridgeSettings: { enabled: true, port: 4100 },
      mcpBridgeStatus: {
        status: "listening",
        port: 4100,
        readOnly: true,
        error: null,
        message: "브릿지가 포트를 열었습니다.",
        clientCount: 1,
        lastConnectionTestAt: "2026-07-12T12:00:00.000Z",
        lastConnectionTestOk: true,
      },
      mcpBridgePortInput: "4100",
      isMcpBridgeBrowserBlocked: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "고급" }));

    expect(screen.getByText(/상태:/)).toHaveTextContent("수신 중");
    expect(screen.getByText(/포트:/)).toHaveTextContent("4100");
    expect(screen.getByText(/읽기 전용:/)).toHaveTextContent("예");
    expect(screen.getByText(/연결 테스트:/)).toHaveTextContent("성공");
    expect(screen.getByText(/연결된 클라이언트:/)).toHaveTextContent("1");
    expect(screen.getByText(/안내:/)).toHaveTextContent("브릿지가 포트를 열었습니다.");
  });

  it("shows one-time pairing controls without a persistent token field", () => {
    const createMcpBridgePairing = vi.fn().mockResolvedValue(undefined);
    renderSettingsModal({
      mcpBridgeSettings: { enabled: true, port: 43129 },
      isMcpBridgeBrowserBlocked: false,
      createMcpBridgePairing,
      mcpBridgePairingSession: {
        code: "PAIR-1234",
        expiresAt: "2026-07-13T12:00:00.000Z",
        bridgeUrl: "http://127.0.0.1:43129/mcp",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "고급" }));
    expect(screen.getByRole("button", { name: "연결 코드 만들기" })).toBeEnabled();
    expect(screen.getByText("PAIR-1234")).toBeInTheDocument();
    expect(screen.queryByLabelText(/bearer|토큰/i)).not.toBeInTheDocument();
  });
});
