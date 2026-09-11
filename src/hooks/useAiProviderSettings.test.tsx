import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProviderSettings, AiProviderStatus } from "../types";

const {
  clearAiProviderKey,
  getAiProviderStatus,
  saveAiProviderConfig,
  saveAiProviderKey,
  testAiProviderConnection,
} = vi.hoisted(() => ({
  clearAiProviderKey: vi.fn(),
  getAiProviderStatus: vi.fn(),
  saveAiProviderConfig: vi.fn(),
  saveAiProviderKey: vi.fn(),
  testAiProviderConnection: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => true) }));

vi.mock("../api", () => ({
  clearAiProviderKey,
  getAiProviderStatus,
  saveAiProviderConfig,
  saveAiProviderKey,
  testAiProviderConnection,
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

  it("serializes config writes and preserves the latest desired patch", async () => {
    const writes: AiProviderSettings[] = [];
    let releaseFirst!: () => void;
    saveAiProviderConfig.mockImplementation((value: AiProviderSettings) => {
      writes.push(value);
      if (writes.length === 1) return new Promise<AiProviderStatus>((resolve) => { releaseFirst = () => resolve(availableStatus); });
      return Promise.resolve(availableStatus);
    });
    const refreshSettings = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useAiProviderSettings({
      aiProvider: provider,
      refreshSettings,
      setSettingsMessage: vi.fn(),
    }));
    await waitFor(() => expect(getAiProviderStatus).toHaveBeenCalled());
    const first = result.current.updateAiProviderConfig({ model: "openai/g" });
    const second = result.current.updateAiProviderConfig({ model: "openai/gpt" });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].model).toBe("openai/g");
    releaseFirst();
    await first;
    await second;
    expect(writes).toHaveLength(2);
    expect(writes[1].model).toBe("openai/gpt");
  });

  it("waits for an OpenRouter config save before storing its key", async () => {
    let releaseConfig!: () => void;
    saveAiProviderConfig.mockImplementationOnce(() => new Promise<AiProviderStatus>((resolve) => {
      releaseConfig = () => resolve({ ...availableStatus, provider: "openrouter", type: "openrouter" });
    }));
    saveAiProviderKey.mockResolvedValue({ ...availableStatus, provider: "openrouter", type: "openrouter" });
    const { result } = renderHook(() => useAiProviderSettings({
      aiProvider: provider,
      refreshSettings: vi.fn().mockResolvedValue(true),
      setSettingsMessage: vi.fn(),
    }));
    await waitFor(() => expect(getAiProviderStatus).toHaveBeenCalled());
    let store!: Promise<void>;
    act(() => {
      void result.current.updateAiProviderConfig({ provider: "openrouter", type: "openrouter" });
      result.current.setAiProviderKeyInput("router-key");
    });
    await waitFor(() => expect(result.current.aiProviderKeyInput).toBe("router-key"));
    await waitFor(() => expect(saveAiProviderConfig).toHaveBeenCalledOnce());
    act(() => {
      store = result.current.storeAiProviderKey();
    });
    expect(saveAiProviderKey).not.toHaveBeenCalled();
    act(() => {
      releaseConfig();
    });
    await store;
    expect(saveAiProviderKey).toHaveBeenCalledWith("router-key", "openrouter");
  });

  it("does not run key removal or connection testing after the required config save fails", async () => {
    saveAiProviderConfig.mockRejectedValueOnce(new Error("settings disk failure"));
    const setSettingsMessage = vi.fn();
    const { result } = renderHook(() => useAiProviderSettings({
      aiProvider: provider,
      refreshSettings: vi.fn().mockResolvedValue(true),
      setSettingsMessage,
    }));
    await waitFor(() => expect(getAiProviderStatus).toHaveBeenCalled());
    act(() => {
      const save = result.current.updateAiProviderConfig({ provider: "openrouter", type: "openrouter" });
      const remove = result.current.removeAiProviderKey();
      const test = result.current.testAiProvider();
      void Promise.all([save, remove, test]);
    });
    await waitFor(() => expect(setSettingsMessage).toHaveBeenCalledWith("settings disk failure"));
    expect(clearAiProviderKey).not.toHaveBeenCalled();
    expect(testAiProviderConnection).not.toHaveBeenCalled();
    expect(setSettingsMessage).toHaveBeenCalledWith("settings disk failure");
  });

  it("flushes every queued config write and rejects when the latest write failed", async () => {
    let releaseFirst!: () => void;
    saveAiProviderConfig
      .mockImplementationOnce(() => new Promise<AiProviderStatus>((resolve) => { releaseFirst = () => resolve(availableStatus); }))
      .mockRejectedValueOnce(new Error("latest save failed"));
    const { result } = renderHook(() => useAiProviderSettings({
      aiProvider: provider,
      refreshSettings: vi.fn().mockResolvedValue(true),
      setSettingsMessage: vi.fn(),
    }));
    let flush!: Promise<void>;
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.updateAiProviderConfig({ model: "first" });
      second = result.current.updateAiProviderConfig({ model: "second" });
      flush = result.current.flushAiProviderConfig();
    });
    await waitFor(() => expect(saveAiProviderConfig).toHaveBeenCalledTimes(1));
    act(() => {
      releaseFirst();
    });
    await Promise.all([first, second]);
    await expect(flush).rejects.toThrow("latest save failed");
  });
});
