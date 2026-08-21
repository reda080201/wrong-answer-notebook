import { createContext, useCallback, useContext, ReactNode, useMemo, useState } from "react";
import type {
  AppSettings,
  AiProviderStatus,
  ChatGptMcpPreferences,
  EntryTemplate,
  ExamPreferences,
  ExamPrintPreferences,
  GptMcpPreferences,
  ImagePreferences,
  IntegrityReport,
  MemoTemplate,
  PromptTemplate,
  ThemeMode,
  ViewPreferences,
  AppUpdatePreferences,
  QuestionBankPreferences,
} from "../types";
import type {
  McpBridgeRuntimeStatus,
  McpBridgeSettings,
} from "../hooks/useMcpBridgeSettings";
import type { McpBridgePairingSession } from "../types";
import type { AppUpdateState } from "../features/updater/model/appUpdate";
import { useSettings } from "../hooks/useSettings";
import { useTheme } from "../hooks/useTheme";
import { useAiProviderSettings } from "../hooks/useAiProviderSettings";
import { useMcpBridgeSettings } from "../hooks/useMcpBridgeSettings";

/**
 * SettingsContextValue contains all settings-related state and functions,
 * organized by conceptual grouping (theme, AI, view, exam, etc.)
 */
export interface SettingsContextValue {
  // ============ Core Settings State ============
  settings: AppSettings;
  settingsError: string | null;
  settingsSaveState: "idle" | "saving" | "saved" | "error";
  settingsMessage: string | null;
  setSettingsMessage: (message: string | null) => void;

  // ============ Settings Actions ============
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setSettings: (settings: AppSettings) => Promise<void>;
  refreshSettings: () => Promise<boolean>;
  flushSettings: () => Promise<void>;
  setSettingsMaintenanceBlocked: (blocked: boolean) => void;
  clearSettingsError: () => void;
  retrySettingsSave: () => Promise<void>;

  // ============ Theme Controller ============
  theme: {
    current: ThemeMode;
    set: (theme: ThemeMode) => void;
  };

  // ============ AI Provider Controller ============
  aiProvider: {
    status: AiProviderStatus | null;
    statusLoading: boolean;
    statusError: string | null;
    keyInput: string;
    setKeyInput: (value: string) => void;
    updateConfig: (patch: Partial<AppSettings["aiProvider"]>) => Promise<void>;
    storeKey: () => Promise<void>;
    removeKey: () => Promise<void>;
  };

  // ============ View Preferences Controller ============
  viewPreferences: {
    preferences: ViewPreferences;
    patch: (patch: Partial<ViewPreferences>) => Promise<void>;
  };

  // ============ Exam Preferences Controller ============
  examPreferences: {
    preferences: ExamPreferences;
    printPreferences: ExamPrintPreferences;
    patch: (patch: Partial<ExamPreferences>) => Promise<void>;
    patchPrint: (patch: Partial<ExamPrintPreferences>) => Promise<void>;
  };

  // ============ Image Preferences Controller ============
  imagePreferences: {
    preferences: ImagePreferences;
    patch: (patch: Partial<ImagePreferences>) => Promise<void>;
  };

  // ============ GPT MCP Preferences Controller ============
  gptMcpPreferences: {
    preferences: GptMcpPreferences;
    patch: (patch: Partial<GptMcpPreferences>) => Promise<void>;
  };

  // ============ ChatGPT MCP Preferences Controller ============
  chatGptMcpPreferences: {
    preferences: ChatGptMcpPreferences;
    patch: (patch: Partial<ChatGptMcpPreferences>) => Promise<void>;
  };

  // ============ MCP Bridge Controller ============
  mcpBridge: {
    settings: McpBridgeSettings;
    status: McpBridgeRuntimeStatus | null;
    portInput: string;
    setPortInput: (value: string) => void;
    pairingSession: McpBridgePairingSession | null;
    isPairingPending: boolean;
    isConnectionTesting: boolean;
    isBrowserBlocked: boolean;
    updateConfig: (patch: Partial<McpBridgeSettings>) => Promise<void>;
    applyPort: () => Promise<void>;
    testConnection: () => Promise<McpBridgeRuntimeStatus>;
    createPairing: () => Promise<void>;
    rotateCredential: () => Promise<void>;
    disconnectClients: () => Promise<void>;
  };

  // ============ Template Controllers ============
  templates: {
    entries: EntryTemplate[];
    save: (template: EntryTemplate) => Promise<void>;
    delete: (templateId: string) => Promise<void>;
  };

  promptTemplates: {
    list: PromptTemplate[];
    save: (template: PromptTemplate) => Promise<void>;
    delete: (templateId: string) => Promise<void>;
    setLastUsed: (templateId: string) => Promise<void>;
  };

  memoTemplates: {
    list: MemoTemplate[];
    save: (template: MemoTemplate) => Promise<void>;
    delete: (templateId: string) => Promise<void>;
  };

  // ============ Data Management ============
  data: {
    integrityReport: IntegrityReport | null;
    runIntegrity: () => Promise<void>;
    handleBackup: () => Promise<void>;
    handleRestore: () => Promise<void>;
    handleCleanupOrphans: () => Promise<void>;
  };

  // ============ Update Management ============
  updates: {
    state: AppUpdateState | undefined;
    preferences: AppUpdatePreferences;
    checkForUpdate: () => Promise<void>;
    installUpdate: () => Promise<void>;
    restartAfterUpdate: () => Promise<void>;
    openReleasePage: () => void;
    patchPreferences: (patch: Partial<AppUpdatePreferences>) => Promise<void>;
  };

  // ============ Question Bank ============
  questionBank: {
    preferences: QuestionBankPreferences | undefined;
    patch: (patch: Partial<QuestionBankPreferences>) => Promise<void>;
  };
}

const noopAsync = async () => undefined;
const noop = () => undefined;

const SettingsContext = createContext<SettingsContextValue | null>(null);

export interface SettingsProviderProps {
  children: ReactNode;
  // These props are passed from App.tsx to provide data management and update features
  settingsMessage?: string | null;
  integrityReport?: IntegrityReport | null;
  handleBackup?: () => Promise<void>;
  handleRestore?: () => Promise<void>;
  handleCleanupOrphans?: () => Promise<void>;
  handleRunIntegrity?: () => Promise<void>;
  updateState?: AppUpdateState | undefined;
  onCheckForUpdate?: () => Promise<void>;
  onInstallUpdate?: () => Promise<void>;
  onRestartAfterUpdate?: () => Promise<void>;
  onOpenReleasePage?: () => void;
}

/**
 * SettingsProvider wraps the app with centralized settings state.
 * It combines all settings-related hooks and provides them via context.
 */
export function SettingsProvider({
  children,
  settingsMessage: initialSettingsMessage = null,
  integrityReport = null,
  handleBackup = noopAsync,
  handleRestore = noopAsync,
  handleCleanupOrphans = noopAsync,
  handleRunIntegrity = noopAsync,
  updateState,
  onCheckForUpdate = noopAsync,
  onInstallUpdate = noopAsync,
  onRestartAfterUpdate = noopAsync,
  onOpenReleasePage = noop,
}: SettingsProviderProps) {
  const settingsHook = useSettings();
  const { theme, setTheme } = useTheme();
  const [settingsMessage, setSettingsMessage] = useState<string | null>(initialSettingsMessage);

  const aiProvider = useAiProviderSettings({
    aiProvider: settingsHook.settings.aiProvider,
    refreshSettings: settingsHook.refreshSettings,
    setSettingsMessage,
  });
  
  const persistMcpBridge = useCallback(async (next: McpBridgeSettings) => {
    await settingsHook.patchSettings({ mcpBridge: next });
  }, [settingsHook.patchSettings]);

  const mcpBridge = useMcpBridgeSettings({
    mcpBridge: settingsHook.settings.mcpBridge,
    persistMcpBridge,
    setSettingsMessage,
  });

  const value: SettingsContextValue = useMemo(
    () => ({
      // Core Settings State
      settings: settingsHook.settings,
      settingsError: settingsHook.settingsError,
      settingsSaveState: settingsHook.settingsSaveState,
      settingsMessage,
      setSettingsMessage,

      // Settings Actions
      patchSettings: settingsHook.patchSettings,
      setSettings: settingsHook.setSettings,
      refreshSettings: settingsHook.refreshSettings,
      flushSettings: settingsHook.flushSettings,
      setSettingsMaintenanceBlocked: settingsHook.setSettingsMaintenanceBlocked,
      clearSettingsError: settingsHook.clearSettingsError,
      retrySettingsSave: settingsHook.retrySettingsSave,

      // Theme Controller
      theme: {
        current: theme,
        set: setTheme,
      },

      // AI Provider Controller
      aiProvider: {
        status: aiProvider.aiProviderStatus,
        statusLoading: aiProvider.aiProviderStatusLoading,
        statusError: aiProvider.aiProviderStatusError,
        keyInput: aiProvider.aiProviderKeyInput,
        setKeyInput: aiProvider.setAiProviderKeyInput,
        updateConfig: aiProvider.updateAiProviderConfig,
        storeKey: aiProvider.storeAiProviderKey,
        removeKey: aiProvider.removeAiProviderKey,
      },

      // View Preferences Controller
      viewPreferences: {
        preferences: settingsHook.settings.viewPreferences,
        patch: settingsHook.patchViewPreferences,
      },

      // Exam Preferences Controller
      examPreferences: {
        preferences: settingsHook.settings.examPreferences,
        printPreferences: settingsHook.settings.examPrintPreferences,
        patch: settingsHook.patchExamPreferences,
        patchPrint: settingsHook.patchExamPrintPreferences,
      },

      // Image Preferences Controller
      imagePreferences: {
        preferences: settingsHook.settings.imagePreferences,
        patch: settingsHook.patchImagePreferences,
      },

      // GPT MCP Preferences Controller
      gptMcpPreferences: {
        preferences: settingsHook.settings.gptMcpPreferences,
        patch: settingsHook.patchGptMcpPreferences,
      },

      // ChatGPT MCP Preferences Controller
      chatGptMcpPreferences: {
        preferences: settingsHook.settings.chatGptMcpPreferences,
        patch: settingsHook.patchChatGptMcpPreferences,
      },

      // MCP Bridge Controller
      mcpBridge: {
        settings: mcpBridge.mcpBridgeSettings,
        status: mcpBridge.mcpBridgeStatus,
        portInput: mcpBridge.mcpBridgePortInput,
        setPortInput: mcpBridge.setMcpBridgePortInput,
        pairingSession: mcpBridge.pairingSession,
        isPairingPending: mcpBridge.isMcpBridgePairingPending,
        isConnectionTesting: mcpBridge.isMcpBridgeConnectionTesting,
        isBrowserBlocked: mcpBridge.isMcpBridgeBrowserBlocked,
        updateConfig: mcpBridge.updateMcpBridgeConfig,
        applyPort: mcpBridge.applyMcpBridgePort,
        testConnection: mcpBridge.testMcpBridgeConnection,
        createPairing: mcpBridge.createPairing,
        rotateCredential: mcpBridge.rotateCredential,
        disconnectClients: mcpBridge.disconnectClients,
      },

      // Template Controllers
      templates: {
        entries: settingsHook.settings.templates,
        save: settingsHook.upsertTemplate,
        delete: settingsHook.removeTemplate,
      },

      promptTemplates: {
        list: settingsHook.settings.promptTemplates,
        save: settingsHook.upsertPromptTemplate,
        delete: settingsHook.removePromptTemplate,
        setLastUsed: settingsHook.setLastImportTemplate,
      },

      memoTemplates: {
        list: settingsHook.settings.memoTemplates,
        save: settingsHook.upsertMemoTemplate,
        delete: settingsHook.removeMemoTemplate,
      },

      // Data Management
      data: {
        integrityReport,
        runIntegrity: handleRunIntegrity,
        handleBackup,
        handleRestore,
        handleCleanupOrphans,
      },

      // Update Management
      updates: {
        state: updateState,
        preferences: settingsHook.settings.updatePreferences,
        checkForUpdate: onCheckForUpdate,
        installUpdate: onInstallUpdate,
        restartAfterUpdate: onRestartAfterUpdate,
        openReleasePage: onOpenReleasePage,
        patchPreferences: settingsHook.patchUpdatePreferences,
      },

      // Question Bank
      questionBank: {
        preferences: settingsHook.settings.questionBankPreferences,
        patch: settingsHook.patchQuestionBankPreferences,
      },
    }),
    [
      settingsHook,
      theme,
      setTheme,
      aiProvider,
      mcpBridge,
      settingsMessage,
      integrityReport,
      handleBackup,
      handleRestore,
      handleCleanupOrphans,
      handleRunIntegrity,
      updateState,
      onCheckForUpdate,
      onInstallUpdate,
      onRestartAfterUpdate,
      onOpenReleasePage,
    ],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Hook to access SettingsContext.
 * Must be called within a SettingsProvider.
 */
export function useSettingsContext(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error(
      "useSettingsContext must be used within a SettingsProvider. Make sure SettingsProvider wraps your component tree.",
    );
  }
  return context;
}
