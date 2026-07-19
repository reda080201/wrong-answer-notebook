import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../api";
import { useSettings } from "./useSettings";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    loadSettings: vi.fn(async () => actual.defaultSettings),
    saveSettings: vi.fn(async () => undefined),
  };
});

import { loadSettings, saveSettings } from "../api";

const mockedLoadSettings = vi.mocked(loadSettings);
const mockedSaveSettings = vi.mocked(saveSettings);

describe("useSettings", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockedLoadSettings.mockResolvedValue(defaultSettings);
    mockedSaveSettings.mockResolvedValue(undefined);
  });

  it("surfaces Korean load fallback with the original error detail", async () => {
    mockedLoadSettings.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.settingsError).toBe("설정을 불러오지 못했습니다. (network down)");
    });
  });

  it("surfaces Korean save fallback with the original error detail", async () => {
    mockedSaveSettings.mockRejectedValueOnce(new Error("disk full"));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(result.current.settings).toEqual(defaultSettings);
    });

    let saveError: unknown;
    await act(async () => {
      try {
        await result.current.setSettings(defaultSettings);
      } catch (error) {
        saveError = error;
      }
    });

    expect(saveError).toBeInstanceOf(Error);
    expect((saveError as Error).message).toBe("설정을 저장하지 못했습니다. (disk full)");
    await waitFor(() => {
      expect(result.current.settingsError).toBe("설정을 저장하지 못했습니다. (disk full)");
    });
  });

  it("uses Korean load fallback when the error has no message", async () => {
    mockedLoadSettings.mockRejectedValueOnce(null);

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.settingsError).toBe("설정을 불러오지 못했습니다.");
    });
  });

  it("uses Korean save fallback when the error has no message", async () => {
    mockedSaveSettings.mockRejectedValueOnce(null);

    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(result.current.settings).toEqual(defaultSettings);
    });

    let saveError: unknown;
    await act(async () => {
      try {
        await result.current.setSettings(defaultSettings);
      } catch (error) {
        saveError = error;
      }
    });

    expect(saveError).toBeInstanceOf(Error);
    expect((saveError as Error).message).toBe("설정을 저장하지 못했습니다.");
    await waitFor(() => {
      expect(result.current.settingsError).toBe("설정을 저장하지 못했습니다.");
    });
  });
});
