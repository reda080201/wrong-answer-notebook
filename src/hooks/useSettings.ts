import { useCallback, useEffect, useRef, useState } from "react";
import { defaultSettings, errorMessage, loadSettings, saveSettings } from "../api";
import type {
  AppSettings,
  ChatGptMcpPreferences,
  EntryTemplate,
  ExamPreferences,
  ExamPrintPreferences,
  GptMcpPreferences,
  ImagePreferences,
  MemoTemplate,
  PromptTemplate,
  ViewPreferences,
  AppUpdatePreferences,
} from "../types";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const settingsRef = useRef(settings);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastOperationRef = useRef<Promise<void>>(Promise.resolve());

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

  const updateSettings = useCallback((next: AppSettings) => {
    // Update the in-memory snapshot before enqueueing so consecutive patches
    // are based on one monotonic state rather than a stale React render.
    settingsRef.current = next;
    setSettings(next);
    setSettingsError(null);
    setSettingsSaveState("saving");
    const operation = saveQueueRef.current.then(async () => {
      try {
        await saveSettings(next);
      } catch (error) {
        const message = errorMessage(error, "설정을 저장하지 못했습니다.");
        setSettingsError(message);
        setSettingsSaveState("error");
        throw new Error(message, { cause: error });
      }
      setSettingsSaveState("saved");
    });
    lastOperationRef.current = operation;
    saveQueueRef.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const retrySettingsSave = useCallback(() => updateSettings(settingsRef.current), [updateSettings]);
  const flushSettings = useCallback(() => lastOperationRef.current, []);

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

  const patchViewPreferences = useCallback(
    async (patch: Partial<ViewPreferences>) => {
      const current = settingsRef.current;
      const nextView = { ...current.viewPreferences, ...patch };
      await updateSettings({
        ...current,
        viewPreferences: nextView,
        answerViewPreferences: {
          ...current.answerViewPreferences,
          hideAnswers: nextView.hideAnswers,
        },
      });
    },
    [updateSettings],
  );

  const patchExamPreferences = useCallback(
    async (patch: Partial<ExamPreferences>) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        examPreferences: { ...current.examPreferences, ...patch },
      });
    },
    [updateSettings],
  );

  const patchExamPrintPreferences = useCallback(
    async (patch: Partial<ExamPrintPreferences>) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        examPrintPreferences: { ...current.examPrintPreferences, ...patch },
      });
    },
    [updateSettings],
  );

  const patchImagePreferences = useCallback(
    async (patch: Partial<ImagePreferences>) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        imagePreferences: { ...current.imagePreferences, ...patch },
      });
    },
    [updateSettings],
  );

  const patchGptMcpPreferences = useCallback(
    async (patch: Partial<GptMcpPreferences>) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        gptMcpPreferences: { ...current.gptMcpPreferences, ...patch },
      });
    },
    [updateSettings],
  );

  const patchChatGptMcpPreferences = useCallback(
    async (patch: Partial<ChatGptMcpPreferences>) => {
      const current = settingsRef.current;
      await updateSettings({
        ...current,
        chatGptMcpPreferences: { ...current.chatGptMcpPreferences, ...patch },
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

  const patchUpdatePreferences = useCallback(async (patch: Partial<AppUpdatePreferences>) => {
    const current = settingsRef.current;
    await updateSettings({ ...current, updatePreferences: { ...current.updatePreferences, ...patch } });
  }, [updateSettings]);

  return {
    settings,
    settingsError,
    settingsSaveState,
    setSettings: updateSettings,
    patchSettings,
    patchViewPreferences,
    patchExamPreferences,
    patchExamPrintPreferences,
    patchImagePreferences,
    patchGptMcpPreferences,
    patchChatGptMcpPreferences,
    upsertTemplate,
    removeTemplate,
    upsertPromptTemplate,
    removePromptTemplate,
    upsertMemoTemplate,
    removeMemoTemplate,
    setLastImportTemplate,
    patchUpdatePreferences,
    refreshSettings,
    retrySettingsSave,
    flushSettings,
    clearSettingsError: () => setSettingsError(null),
  };
}
