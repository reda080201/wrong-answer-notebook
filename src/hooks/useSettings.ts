import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const persistedSettingsRef = useRef(settings);
  const pendingRecipesRef = useRef(new Map<number, (current: AppSettings) => AppSettings>());
  const mutationRef = useRef(0);
  const failedRecipeRef = useRef<((current: AppSettings) => AppSettings) | null>(null);
  const failedErrorRef = useRef<Error | null>(null);
  const loadedRef = useRef(false);
  const maintenanceBlockedRef = useRef(false);
  const { enqueue, drain } = useSerialTaskQueue();

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const loadSettingsSnapshot = useCallback(async () => {
    let revision = mutationRef.current;
    try {
      await drain();
      revision = mutationRef.current;
      const loaded = await loadSettings();
      return { revision, ok: true as const, settings: loaded };
    } catch (error) {
      return { revision, ok: false as const, error };
    }
  }, [drain]);

  const applySettingsSnapshot = useCallback((result: Awaited<ReturnType<typeof loadSettingsSnapshot>>) => {
    if (result.revision !== mutationRef.current) {
      loadedRef.current = true;
      return false;
    }
    if (!result.ok) {
      loadedRef.current = false;
      setSettingsError(errorMessage(result.error, "설정을 불러오지 못했습니다."));
      return false;
    }
    persistedSettingsRef.current = result.settings;
    pendingRecipesRef.current.clear();
    settingsRef.current = result.settings;
    setSettings(result.settings);
    setSettingsError(null);
    loadedRef.current = true;
    return true;
  }, []);

  const refreshSettings = useCallback((): Promise<boolean> => {
    loadedRef.current = false;
    setSettingsError(null);
    return loadSettingsSnapshot().then(applySettingsSnapshot);
  }, [applySettingsSnapshot, loadSettingsSnapshot]);

  useEffect(() => {
    void loadSettingsSnapshot().then(applySettingsSnapshot);
  }, [applySettingsSnapshot, loadSettingsSnapshot]);

  const refreshVisibleSettings = useCallback(() => {
    let next = persistedSettingsRef.current;
    for (const recipe of pendingRecipesRef.current.values()) next = recipe(next);
    settingsRef.current = next;
    setSettings(next);
  }, []);

  const enqueueSettingsRecipe = useCallback((recipe: (current: AppSettings) => AppSettings, retrying = false) => {
    if (maintenanceBlockedRef.current) {
      return Promise.reject(new Error("백업 또는 복원이 진행 중입니다. 완료된 뒤 다시 시도해 주세요."));
    }
    if (!loadedRef.current) {
      return Promise.reject(new Error("설정을 불러오는 중입니다. 잠시 후 다시 시도해 주세요."));
    }
    const mutation = ++mutationRef.current;
    pendingRecipesRef.current.set(mutation, recipe);
    refreshVisibleSettings();
    setSettingsError(null);
    setSettingsSaveState("saving");
    const operation = enqueue(async () => {
      const next = recipe(persistedSettingsRef.current);
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
      persistedSettingsRef.current = next;
      pendingRecipesRef.current.delete(mutation);
      if (retrying) {
        failedErrorRef.current = null;
        failedRecipeRef.current = null;
      }
      if (mutation === mutationRef.current) {
        setSettingsError(null);
        setSettingsSaveState("saved");
      }
      refreshVisibleSettings();
    });
    return operation.catch((error) => {
      pendingRecipesRef.current.delete(mutation);
      failedRecipeRef.current = recipe;
      failedErrorRef.current = error instanceof Error ? error : new Error(String(error));
      if (mutation === mutationRef.current) {
        setSettingsSaveState("error");
      }
      refreshVisibleSettings();
      throw error;
    });
  }, [enqueue, refreshVisibleSettings]);

  const updateSettings = useCallback((next: AppSettings) => enqueueSettingsRecipe(() => next), [enqueueSettingsRecipe]);

  const retrySettingsSave = useCallback(() => {
    const recipe = failedRecipeRef.current;
    return recipe ? enqueueSettingsRecipe(recipe, true) : Promise.resolve();
  }, [enqueueSettingsRecipe]);
  const flushSettings = useCallback(async () => {
    await drain();
    if (failedErrorRef.current) throw failedErrorRef.current;
  }, [drain]);

  const patchSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      await enqueueSettingsRecipe((current) => ({ ...current, ...patch }));
    },
    [enqueueSettingsRecipe],
  );

  const upsertTemplate = useCallback(
    async (template: EntryTemplate) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        templates: [
          template,
          ...current.templates.filter((item) => item.id !== template.id),
        ],
      }));
    },
    [enqueueSettingsRecipe],
  );

  const removeTemplate = useCallback(
    async (templateId: string) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        templates: current.templates.filter((item) => item.id !== templateId),
      }));
    },
    [enqueueSettingsRecipe],
  );

  const upsertPromptTemplate = useCallback(
    async (template: PromptTemplate) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        promptTemplates: [
          template,
          ...current.promptTemplates.filter((item) => item.id !== template.id),
        ],
      }));
    },
    [enqueueSettingsRecipe],
  );

  const removePromptTemplate = useCallback(
    async (templateId: string) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        promptTemplates: current.promptTemplates.filter(
          (item) => item.id !== templateId || item.builtIn,
        ),
      }));
    },
    [enqueueSettingsRecipe],
  );

  const upsertMemoTemplate = useCallback(
    async (template: MemoTemplate) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        memoTemplates: [
          template,
          ...current.memoTemplates.filter((item) => item.id !== template.id),
        ],
      }));
    },
    [enqueueSettingsRecipe],
  );

  const removeMemoTemplate = useCallback(
    async (templateId: string) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        memoTemplates: current.memoTemplates.filter(
          (item) => item.id !== templateId || item.builtIn,
        ),
      }));
    },
    [enqueueSettingsRecipe],
  );

  const patchViewPreferences = useCallback(
    async (patch: Partial<ViewPreferences>) => {
      await enqueueSettingsRecipe((current) => {
        const nextView = { ...current.viewPreferences, ...patch };
        return {
        ...current,
        viewPreferences: nextView,
        answerViewPreferences: {
          ...current.answerViewPreferences,
          hideAnswers: nextView.hideAnswers,
        },
      };
      });
    },
    [enqueueSettingsRecipe],
  );

  const patchExamPreferences = useCallback(
    async (patch: Partial<ExamPreferences>) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        examPreferences: { ...current.examPreferences, ...patch },
      }));
    },
    [enqueueSettingsRecipe],
  );

  const patchExamPrintPreferences = useCallback(
    async (patch: Partial<ExamPrintPreferences>) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        examPrintPreferences: { ...current.examPrintPreferences, ...patch },
      }));
    },
    [enqueueSettingsRecipe],
  );

  const patchImagePreferences = useCallback(
    async (patch: Partial<ImagePreferences>) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        imagePreferences: { ...current.imagePreferences, ...patch },
      }));
    },
    [enqueueSettingsRecipe],
  );

  const patchGptMcpPreferences = useCallback(
    async (patch: Partial<GptMcpPreferences>) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        gptMcpPreferences: { ...current.gptMcpPreferences, ...patch },
      }));
    },
    [enqueueSettingsRecipe],
  );

  const patchChatGptMcpPreferences = useCallback(
    async (patch: Partial<ChatGptMcpPreferences>) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        chatGptMcpPreferences: { ...current.chatGptMcpPreferences, ...patch },
      }));
    },
    [enqueueSettingsRecipe],
  );

  const setLastImportTemplate = useCallback(
    async (templateId: string) => {
      await enqueueSettingsRecipe((current) => ({
        ...current,
        importPreferences: {
          ...current.importPreferences,
          lastPromptTemplateId: templateId,
        },
      }));
    },
    [enqueueSettingsRecipe],
  );

  const patchUpdatePreferences = useCallback(async (patch: Partial<AppUpdatePreferences>) => {
    await enqueueSettingsRecipe((current) => ({
      ...current,
      updatePreferences: { ...current.updatePreferences, ...patch },
    }));
  }, [enqueueSettingsRecipe]);

  const patchQuestionBankPreferences = useCallback(async (patch: Partial<QuestionBankPreferences>) => {
    await enqueueSettingsRecipe((current) => ({
      ...current,
      questionBankPreferences: { ...current.questionBankPreferences, ...patch },
    }));
  }, [enqueueSettingsRecipe]);

  const setSettingsMaintenanceBlocked = useCallback((blocked: boolean) => {
    maintenanceBlockedRef.current = blocked;
  }, []);

  const clearSettingsError = useCallback(() => setSettingsError(null), []);

  return useMemo(() => ({
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
    clearSettingsError,
  }), [
    settings,
    settingsError,
    settingsSaveState,
    updateSettings,
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
    clearSettingsError,
  ]);
}
