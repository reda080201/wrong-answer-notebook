import { isTauri } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "uuid";
import type {
  AppSettings,
  AppUpdatePreferences,
  MemoTemplate,
  PromptTemplate,
  QuestionBankPreferences,
  QuestionBankSort,
  QuestionBankStoredFilters,
} from "../../models/settings";
import type { AiProviderSettings, AiProviderType, McpBridgeSettings } from "../../models/integrations";
import {
  DEFAULT_CHATGPT_MCP_PREFERENCES,
  DEFAULT_EXAM_PREFERENCES,
  DEFAULT_EXAM_PRINT_PREFERENCES,
  DEFAULT_GPT_MCP_PREFERENCES,
  DEFAULT_IMAGE_PREFERENCES,
  DEFAULT_VIEW_PREFERENCES,
  normalizeChatGptMcpPreferences,
  normalizeExamPreferences,
  normalizeExamPrintPreferences,
  normalizeGptMcpPreferences,
  normalizeImagePreferences,
  resolveViewPreferences,
} from "../../utils/viewPreferences";
import { DEFAULT_LIBRARY_PREFERENCES, normalizeLibraryPreferences } from "../../utils/libraryClassification";
import { getStorageBackend } from "../storageBackend";
import { builtInMemoTemplates, builtInPromptTemplates } from "./prompts";
import { errorMessage } from "./shared";

export const DEFAULT_SETTINGS: AppSettings = {
  templates: [],
  promptTemplates: [],
  memoTemplates: [],
  aiProvider: {
    provider: "openai-compatible",
    type: "manual",
    model: "",
    enabled: false,
    keySource: "env",
    hasStoredKey: false,
  },
  importPreferences: {},
  viewPreferences: DEFAULT_VIEW_PREFERENCES,
  examPreferences: DEFAULT_EXAM_PREFERENCES,
  examPrintPreferences: DEFAULT_EXAM_PRINT_PREFERENCES,
  imagePreferences: DEFAULT_IMAGE_PREFERENCES,
  gptMcpPreferences: DEFAULT_GPT_MCP_PREFERENCES,
  chatGptMcpPreferences: DEFAULT_CHATGPT_MCP_PREFERENCES,
  answerViewPreferences: {
    viewMode: "card",
    hideAnswers: false,
  },
  autoBackup: {
    enabled: false,
  },
  mcpBridge: {
    enabled: false,
    port: 43129,
  },
  updatePreferences: {
    autoCheckEnabled: true,
    notificationsEnabled: true,
    backupBeforeInstall: true,
    channel: "stable",
  },
  libraryPreferences: DEFAULT_LIBRARY_PREFERENCES,
};

/** @deprecated Use DEFAULT_SETTINGS */
export const defaultSettings = DEFAULT_SETTINGS;

export async function loadSettings(): Promise<AppSettings> {
  try {
    const stored = await getStorageBackend().loadSettings();
    return normalizeSettings((stored ?? DEFAULT_SETTINGS) as AppSettings);
  } catch (error) {
    throw new Error(errorMessage(error, "설정을 불러오지 못했습니다."), {
      cause: error,
    });
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const normalized = normalizeSettings(settings);
    await getStorageBackend().saveSettings(normalized);
  } catch (error) {
    throw new Error(errorMessage(error, "설정을 저장하지 못했습니다."), {
      cause: error,
    });
  }
}

function mergeBuiltInPromptTemplates(templates: PromptTemplate[]): PromptTemplate[] {
  const userTemplates = templates.filter((template) => !template.builtIn);
  return [
    ...builtInPromptTemplates,
    ...userTemplates.filter(
      (template) => !builtInPromptTemplates.some((builtIn) => builtIn.id === template.id),
    ),
  ];
}

function mergeBuiltInMemoTemplates(templates: MemoTemplate[]): MemoTemplate[] {
  const userTemplates = templates.filter((template) => !template.builtIn);
  return [
    ...builtInMemoTemplates,
    ...userTemplates.filter(
      (template) => !builtInMemoTemplates.some((builtIn) => builtIn.id === template.id),
    ),
  ];
}

function normalizePromptTemplates(raw: unknown): PromptTemplate[] {
  const templates = Array.isArray(raw)
    ? raw
        .filter((template): template is Partial<PromptTemplate> =>
          Boolean(template && typeof template === "object"),
        )
        .map((template) => ({
          id: `${template.id ?? uuidv4()}`,
          name: `${template.name ?? ""}`.trim(),
          content: `${template.content ?? ""}`.trim(),
          builtIn: Boolean(template.builtIn),
        }))
        .filter((template) => template.name && template.content)
    : [];
  return mergeBuiltInPromptTemplates(templates);
}

function normalizeMemoTemplates(raw: unknown): MemoTemplate[] {
  const templates = Array.isArray(raw)
    ? raw
        .filter((template): template is Partial<MemoTemplate> =>
          Boolean(template && typeof template === "object"),
        )
        .map((template) => ({
          id: `${template.id ?? uuidv4()}`,
          name: `${template.name ?? ""}`.trim(),
          content: `${template.content ?? ""}`,
          builtIn: Boolean(template.builtIn),
        }))
        .filter((template) => template.name && template.content.trim())
    : [];
  return mergeBuiltInMemoTemplates(templates);
}

function normalizeAiProvider(raw: unknown): AiProviderSettings {
  if (!isTauri()) {
    return {
      provider: "openai-compatible",
      type: "manual",
      model: "",
      enabled: false,
      keySource: "env",
      hasStoredKey: false,
    };
  }
  const value = raw && typeof raw === "object" ? raw as Partial<AiProviderSettings> : {};
  const legacyType = value.type;
  const provider: Exclude<AiProviderType, "manual" | "gemini-flash-lite" | "gemini-3.5-flash"> =
    value.provider === "openai" || value.provider === "anthropic" || value.provider === "google-gemini" || value.provider === "openrouter" || value.provider === "groq" || value.provider === "openai-compatible"
      ? value.provider
      : legacyType === "gemini-flash-lite" || legacyType === "gemini-3.5-flash"
        ? "google-gemini"
        : "openai-compatible";
  const model = typeof value.model === "string" && value.model.trim()
    ? value.model.trim()
    : legacyType === "gemini-flash-lite"
      ? "gemini-2.5-flash-lite"
      : legacyType === "gemini-3.5-flash"
        ? "gemini-3.5-flash"
        : "";
  const type: AiProviderType = provider === "google-gemini" ? (legacyType === "gemini-flash-lite" || legacyType === "gemini-3.5-flash" ? legacyType : "gemini-3.5-flash") : provider;
  return {
    provider,
    type,
    model,
    baseUrl: typeof value.baseUrl === "string" && value.baseUrl.trim() ? value.baseUrl.trim() : undefined,
    enabled: Boolean(value.enabled),
    keySource: value.keySource === "tauri-settings" || value.keySource === "keyring" ? "keyring" : "env",
    hasStoredKey: Boolean(value.hasStoredKey),
  };
}

export function normalizeSettings(raw: AppSettings): AppSettings {
  const legacyStorage = typeof localStorage !== "undefined" ? localStorage : undefined;
  const viewPreferences = resolveViewPreferences(raw?.viewPreferences, {
    answerViewPreferences: raw?.answerViewPreferences,
    storage: legacyStorage,
  });

  return {
    templates: Array.isArray(raw?.templates)
      ? raw.templates
          .filter((template) => template && template.id && template.name)
          .map((template) => ({
            ...template,
            data: template.data ?? {},
          }))
      : [],
    promptTemplates: normalizePromptTemplates(raw?.promptTemplates),
    memoTemplates: normalizeMemoTemplates(raw?.memoTemplates),
    aiProvider: normalizeAiProvider(raw?.aiProvider),
    importPreferences: {
      lastPromptTemplateId:
        typeof raw?.importPreferences?.lastPromptTemplateId === "string"
          ? raw.importPreferences.lastPromptTemplateId
          : undefined,
    },
    viewPreferences,
    examPreferences: normalizeExamPreferences(raw?.examPreferences),
    examPrintPreferences: normalizeExamPrintPreferences(raw?.examPrintPreferences),
    imagePreferences: normalizeImagePreferences(raw?.imagePreferences),
    gptMcpPreferences: normalizeGptMcpPreferences(raw?.gptMcpPreferences),
    chatGptMcpPreferences: normalizeChatGptMcpPreferences(raw?.chatGptMcpPreferences),
    answerViewPreferences: {
      viewMode: raw?.answerViewPreferences?.viewMode === "table" ? "table" : "card",
      hideAnswers: viewPreferences.hideAnswers,
    },
    autoBackup: {
      enabled: Boolean(raw?.autoBackup?.enabled),
      lastBackupAt: raw?.autoBackup?.lastBackupAt,
    },
    mcpBridge: normalizeMcpBridgeSettings(raw?.mcpBridge),
    updatePreferences: normalizeUpdatePreferences(raw?.updatePreferences),
    questionBankPreferences: normalizeQuestionBankPreferences(raw?.questionBankPreferences),
    libraryPreferences: normalizeLibraryPreferences(raw?.libraryPreferences),
  };
}

function normalizeQuestionBankPreferences(raw: unknown): QuestionBankPreferences | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const filters = value.recentFilters && typeof value.recentFilters === "object"
    ? value.recentFilters as QuestionBankStoredFilters
    : undefined;
  const savedPresets: NonNullable<QuestionBankPreferences["savedPresets"]> = Array.isArray(value.savedPresets)
    ? value.savedPresets
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .flatMap((item) => typeof item.id === "string" && typeof item.name === "string" && item.filters && typeof item.filters === "object"
        ? [{
          id: item.id,
          name: item.name.trim(),
          filters: item.filters as QuestionBankStoredFilters,
          sort: (item.sort === "difficulty" || item.sort === "importance" || item.sort === "quality" || item.sort === "review_due" ? item.sort : "updated") as QuestionBankSort,
        }]
        : [])
      .filter((item) => item.name)
    : [];
  const lastSort = value.lastSort === "updated" || value.lastSort === "difficulty" || value.lastSort === "importance" || value.lastSort === "quality" || value.lastSort === "review_due"
    ? value.lastSort
    : "updated";
  return { recentFilters: filters, savedPresets, lastSort };
}

function normalizeUpdatePreferences(raw: unknown): AppUpdatePreferences {
  const value = raw && typeof raw === "object" ? raw as Partial<AppUpdatePreferences> : {};
  return {
    autoCheckEnabled: value.autoCheckEnabled !== false,
    notificationsEnabled: value.notificationsEnabled !== false,
    backupBeforeInstall: value.backupBeforeInstall !== false,
    channel: "stable",
    skippedVersion: typeof value.skippedVersion === "string" ? value.skippedVersion : undefined,
    lastCheckedAt: typeof value.lastCheckedAt === "string" ? value.lastCheckedAt : undefined,
    lastSeenReleaseNotesVersion: typeof value.lastSeenReleaseNotesVersion === "string" ? value.lastSeenReleaseNotesVersion : undefined,
  };
}

function normalizeMcpBridgeSettings(raw: unknown): McpBridgeSettings {
  const value = raw && typeof raw === "object" ? raw as Partial<McpBridgeSettings> : {};
  const requestedPort = Number(value.port);
  const port = Number.isInteger(requestedPort) && requestedPort >= 1024 && requestedPort <= 65535
    ? requestedPort
    : 43129;
  return {
    // The browser preview never exposes a local bridge.
    enabled: isTauri() && Boolean(value.enabled),
    port,
  };
}
