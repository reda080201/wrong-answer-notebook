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
  QuestionBankPreferences,
} from "../types";
import { useSerialTaskQueue } from "./useSerialTaskQueue";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const settingsRef = useRef(settings);
  const mutationRef = useRef(0);
  const failedErrorRef = useRef<Error | null>(null);
  const loadedRef = useRef(false);
  const maintenanceBlockedRef = useRef(false);
  const { enqueue, drain } = useSerialTaskQueue();

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const refreshSettings = useCallback(async (): Promise<boolean> => {
    let refreshMutation = mutationRef.current;
    try {
      setSettingsError(null);
      await drain();
      refreshMutation = mutationRef.current;
      loadedRef.current = false;
      if (refreshMutation !== mutationRef.current) {
        loadedRef.current = true;
        return false;
      }
      const loaded = await loadSettings();
      if (refreshMutation === mutationRef.current) {
        settingsRef.current = loaded;
        setSettings(loaded);
        loadedRef.current = true;
        return true;
      } else {
        loadedRef.current = true;
        return false;
      }
    } catch (error) {
      if (refreshMutation === mutationRef.current) {
        loadedRef.current = false;
        setSettingsError(errorMessage(error, "설정을 불러오지 못했습니다."));
        return false;
      } else {
        loadedRef.current = true;
        return false;
      }
    }
  }, [drain]);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  const updateSettings = useCallback((next: AppSettings) => {
    if (maintenanceBlockedRef.current) {
      return Promise.reject(new Error("백업 또는 복원이 진행 중입니다. 완료된 뒤 다시 시도해 주세요."));
    }
    if (!loadedRef.current) {
      return Promise.reject(new Error("설정을 불러오는 중입니다. 잠시 후 다시 시도해 주세요."));
    }
    // Update the in-memory snapshot before enqueueing so consecutive patches
    // are based on one monotonic state rather than a stale React render.
    settingsRef.current = next;
    setSettings(next);
    setSettingsError(null);
    setSettingsSaveState("saving");
    failedErrorRef.current = null;
    const mutation = ++mutationRef.current;
    const operation = enqueue(async () => {
      try {
        await saveSettings(next);
      } catch (error) {
        const message = errorMessage(error, "설정을 저장하지 못했습니다.");
        if (mutation === mutationRef.current) {
          failedErrorRef.current = new Error(message, { cause: error });
          setSettingsError(message);
          setSettingsSaveState("error");
        }
        throw new Error(message, { cause: error });
      }
      if (mutation === mutationRef.current) {
        failedErrorRef.current = null;
        setSettingsError(null);
        setSettingsSaveState("saved");
      }
    });
    return operation;
  }, [enqueue]);

  const retrySettingsSave = useCallback(() => updateSettings(settingsRef.current), [updateSettings]);
  const flushSettings = useCallback(async () => {
    await drain();
    if (failedErrorRef.current) throw failedErrorRef.current;
  }, [drain]);

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

  const patchQuestionBankPreferences = useCallback(async (patch: Partial<QuestionBankPreferences>) => {
    const current = settingsRef.current;
    await updateSettings({
      ...current,
      questionBankPreferences: { ...current.questionBankPreferences, ...patch },
    });
  }, [updateSettings]);

  const setSettingsMaintenanceBlocked = useCallback((blocked: boolean) => {
    maintenanceBlockedRef.current = blocked;
  }, []);

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
    patchQuestionBankPreferences,
    refreshSettings,
    retrySettingsSave,
    flushSettings,
    setSettingsMaintenanceBlocked,
    clearSettingsError: () => setSettingsError(null),
  };
}
