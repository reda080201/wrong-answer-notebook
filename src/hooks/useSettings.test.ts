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
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(mockedLoadSettings).toHaveBeenCalled();
    });
    mockedSaveSettings.mockRejectedValueOnce(new Error("disk full"));

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
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(mockedLoadSettings).toHaveBeenCalled();
    });
    mockedSaveSettings.mockRejectedValueOnce(null);

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

  it("clears an old save error after a newer save succeeds", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());
    let calls = 0;
    mockedSaveSettings.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error("일시 오류");
    });

    await act(async () => {
      await expect(result.current.setSettings(defaultSettings)).rejects.toThrow("일시 오류");
      await result.current.setSettings({ ...defaultSettings, answerViewPreferences: { ...defaultSettings.answerViewPreferences, hideAnswers: true } });
    });

    expect(result.current.settingsError).toBeNull();
    expect(result.current.settingsSaveState).toBe("saved");
  });

  it("does not carry a failed nested patch into a later queued patch", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());
    mockedSaveSettings.mockRejectedValueOnce(new Error("첫 저장 실패")).mockResolvedValueOnce(undefined);

    const first = result.current.patchViewPreferences({ hideAnswers: true });
    const second = result.current.patchExamPreferences({ showNavigator: false });
    await act(async () => {
      await expect(first).rejects.toThrow("첫 저장 실패");
      await second;
    });

    const persisted = mockedSaveSettings.mock.calls[1][0];
    expect(persisted.viewPreferences.hideAnswers).toBe(defaultSettings.viewPreferences.hideAnswers);
    expect(persisted.examPreferences.showNavigator).toBe(false);
  });

  it("retries the exact failed recipe against the latest persisted settings", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());
    mockedSaveSettings.mockRejectedValueOnce(new Error("첫 저장 실패")).mockResolvedValue(undefined);

    await act(async () => {
      await expect(result.current.patchExamPreferences({ showNavigator: false })).rejects.toThrow("첫 저장 실패");
      await result.current.patchViewPreferences({ hideAnswers: true });
      await result.current.retrySettingsSave();
    });

    const retried = mockedSaveSettings.mock.calls[2][0];
    expect(retried.examPreferences.showNavigator).toBe(false);
    expect(retried.viewPreferences.hideAnswers).toBe(true);
  });
});
