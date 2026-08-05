import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProviderSettings, AiProviderStatus } from "../types";

const {
  clearAiProviderKey,
  getAiProviderStatus,
  saveAiProviderConfig,
  saveAiProviderKey,
} = vi.hoisted(() => ({
  clearAiProviderKey: vi.fn(),
  getAiProviderStatus: vi.fn(),
  saveAiProviderConfig: vi.fn(),
  saveAiProviderKey: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => true) }));

vi.mock("../api", () => ({
  clearAiProviderKey,
  getAiProviderStatus,
  saveAiProviderConfig,
  saveAiProviderKey,
}));

import { useAiProviderSettings } from "./useAiProviderSettings";

const provider: AiProviderSettings = {
  type: "gemini-flash-lite",
  enabled: true,
  keySource: "tauri-settings",
  hasStoredKey: true,
};

const unavailableStatus: AiProviderStatus = {
  ...provider,
  available: false,
  hasEnvKey: false,
};

const availableStatus: AiProviderStatus = {
  ...provider,
  available: true,
  hasEnvKey: false,
};

describe("useAiProviderSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAiProviderStatus.mockResolvedValue(availableStatus);
  });

  it("reports an initial provider-status failure instead of leaving a rejected promise", async () => {
    const setSettingsMessage = vi.fn();
    getAiProviderStatus.mockRejectedValueOnce(new Error("상태 조회 실패"));

    const { result } = renderHook(() =>
      useAiProviderSettings({
        aiProvider: provider,
        refreshSettings: vi.fn().mockResolvedValue(undefined),
        setSettingsMessage,
      }),
    );

    await waitFor(() => {
      expect(setSettingsMessage).toHaveBeenCalledWith("상태 조회 실패");
    });
    expect(result.current.aiProviderStatus).toBeNull();
    expect(result.current.aiProviderStatusError).toBe("상태 조회 실패");
  });

  it("does not let an older status request overwrite the latest provider status", async () => {
    let resolveFirst!: (status: AiProviderStatus) => void;
    let resolveSecond!: (status: AiProviderStatus) => void;
    getAiProviderStatus
      .mockImplementationOnce(() => new Promise<AiProviderStatus>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<AiProviderStatus>((resolve) => { resolveSecond = resolve; }));
    const setSettingsMessage = vi.fn();
    const { result, rerender } = renderHook(
      ({ aiProvider }) => useAiProviderSettings({
        aiProvider,
        refreshSettings: vi.fn().mockResolvedValue(undefined),
        setSettingsMessage,
      }),
      { initialProps: { aiProvider: provider } },
    );

    rerender({ aiProvider: { ...provider, enabled: false } });
    resolveSecond(availableStatus);
    await waitFor(() => expect(result.current.aiProviderStatus).toEqual(availableStatus));

    resolveFirst(unavailableStatus);
    await waitFor(() => expect(result.current.aiProviderStatus).toEqual(availableStatus));
  });
});
