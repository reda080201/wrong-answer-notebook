import { useCallback, useEffect, useRef, useState } from "react";
import { defaultSettings, errorMessage, loadSettings, saveSettings } from "../api";
import type {
  AppSettings,
  EntryTemplate,
  MemoTemplate,
  PromptTemplate,
} from "../types";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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
      settingsRef.current = next;
    } catch (error) {
      const message = errorMessage(error, "설정을 저장하지 못했습니다.");
      setSettingsError(message);
      throw new Error(message, { cause: error });
    }
  }, []);

  const patchSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      await updateSettings({ ...settingsRef.current, ...patch });
    },
    [updateSettings],
  );

  const upsertTemplate = useCallback(
    async (template: EntryTemplate) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        templates: [
          template,
          ...current.templates.filter((item) => item.id !== template.id),
        ],
      });
    },
    [updateSettings],
  );

  const removeTemplate = useCallback(
    async (templateId: string) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        templates: current.templates.filter((item) => item.id !== templateId),
      });
    },
    [updateSettings],
  );

  const upsertPromptTemplate = useCallback(
    async (template: PromptTemplate) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        promptTemplates: [
          template,
          ...current.promptTemplates.filter((item) => item.id !== template.id),
        ],
      });
    },
    [updateSettings],
  );

  const removePromptTemplate = useCallback(
    async (templateId: string) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        promptTemplates: current.promptTemplates.filter(
          (item) => item.id !== templateId || item.builtIn,
        ),
      });
    },
    [updateSettings],
  );

  const upsertMemoTemplate = useCallback(
    async (template: MemoTemplate) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        memoTemplates: [
          template,
          ...current.memoTemplates.filter((item) => item.id !== template.id),
        ],
      });
    },
    [updateSettings],
  );

  const removeMemoTemplate = useCallback(
    async (templateId: string) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        memoTemplates: current.memoTemplates.filter(
          (item) => item.id !== templateId || item.builtIn,
        ),
      });
    },
    [updateSettings],
  );

  const setLastImportTemplate = useCallback(
    async (templateId: string) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        importPreferences: {
          ...current.importPreferences,
          lastPromptTemplateId: templateId,
        },
      });
    },
    [updateSettings],
  );

  return {
    settings,
    settingsError,
    setSettings: updateSettings,
    patchSettings,
    upsertTemplate,
    removeTemplate,
    upsertPromptTemplate,
    removePromptTemplate,
    upsertMemoTemplate,
    removeMemoTemplate,
    setLastImportTemplate,
    refreshSettings,
    clearSettingsError: () => setSettingsError(null),
  };
}
