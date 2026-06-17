import { useCallback, useEffect, useState } from "react";
import { defaultSettings, errorMessage, loadSettings, saveSettings } from "../api";
import type { AppSettings } from "../types";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const refreshSettings = useCallback(async () => {
    try {
      setSettingsError(null);
      setSettings(await loadSettings());
    } catch (error) {
      setSettingsError(errorMessage(error, "설정을 불러오지 못했습니다."));
    }
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  const updateSettings = useCallback(async (next: AppSettings) => {
    try {
      setSettingsError(null);
      await saveSettings(next);
      setSettings(next);
    } catch (error) {
      const message = errorMessage(error, "설정을 저장하지 못했습니다.");
      setSettingsError(message);
      throw new Error(message, { cause: error });
    }
  }, []);

  return {
    settings,
    settingsError,
    setSettings: updateSettings,
    refreshSettings,
    clearSettingsError: () => setSettingsError(null),
  };
}
