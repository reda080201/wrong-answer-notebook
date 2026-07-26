import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EXAM_PREFERENCES,
  DEFAULT_GPT_MCP_PREFERENCES,
  DEFAULT_IMAGE_PREFERENCES,
  DEFAULT_VIEW_PREFERENCES,
  ENTRY_DETAIL_STORAGE_KEYS,
  migrateViewPreferences,
  normalizeExamPreferences,
  normalizeGptMcpPreferences,
  normalizeImagePreferences,
  normalizeViewPreferences,
  resolveViewPreferences,
  type ViewPreferencesLegacyStorage,
} from "./viewPreferences";
import { normalizeSettings } from "../api";
import type { AppSettings } from "../types";

function createMemoryStorage(initial: Record<string, string> = {}): ViewPreferencesLegacyStorage & {
  store: Map<string, string>;
} {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem(key: string) {
      return store.get(key) ?? null;
    },
  };
}

describe("normalizeViewPreferences", () => {
  it("fills defaults for missing fields", () => {
    expect(normalizeViewPreferences(undefined)).toEqual(DEFAULT_VIEW_PREFERENCES);
    expect(normalizeViewPreferences({})).toEqual(DEFAULT_VIEW_PREFERENCES);
  });

  it("coerces invalid enum values and preserves explicit booleans", () => {
    expect(
      normalizeViewPreferences({
        sheetLayout: "wide",
        fontSize: "huge",
        hideAnswers: true,
        showDifficulty: false,
        showOriginalPages: false,
        showLearningVisuals: false,
        compactToolbar: true,
      }),
    ).toEqual({
      sheetLayout: "single",
      fontSize: "normal",
      hideAnswers: true,
      showDifficulty: false,
      showOriginalPages: false,
      showLearningVisuals: false,
      compactToolbar: true,
      lectureLayout: "document",
    });
  });
});

describe("migrateViewPreferences", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("merges answerViewPreferences.hideAnswers with the legacy localStorage hide key", () => {
    const storage = createMemoryStorage({
      [ENTRY_DETAIL_STORAGE_KEYS.answerHide]: "true",
    });

    expect(
      migrateViewPreferences({
        answerViewPreferences: { hideAnswers: false },
        storage,
      }).hideAnswers,
    ).toBe(true);

    expect(
      migrateViewPreferences({
        answerViewPreferences: { hideAnswers: true },
        storage: createMemoryStorage(),
      }).hideAnswers,
    ).toBe(true);
  });

  it("reads sheet layout, font size, and compact toolbar from EntryDetail localStorage keys", () => {
    const storage = createMemoryStorage({
      [ENTRY_DETAIL_STORAGE_KEYS.sheetLayout]: "columns",
      [ENTRY_DETAIL_STORAGE_KEYS.focusTextSize]: "xlarge",
      [ENTRY_DETAIL_STORAGE_KEYS.studyControlCompact]: "true",
    });

    expect(migrateViewPreferences({ storage })).toEqual({
      sheetLayout: "columns",
      fontSize: "xlarge",
      hideAnswers: false,
      showDifficulty: true,
      showOriginalPages: true,
      showLearningVisuals: true,
      compactToolbar: true,
      lectureLayout: "document",
    });
  });

  it("defaults show* toggles to true and compactToolbar to false when legacy keys are absent", () => {
    expect(migrateViewPreferences()).toEqual({
      sheetLayout: "single",
      fontSize: "normal",
      hideAnswers: false,
      showDifficulty: true,
      showOriginalPages: true,
      showLearningVisuals: true,
      compactToolbar: false,
      lectureLayout: "document",
    });
  });
});

describe("resolveViewPreferences", () => {
  it("normalizes saved viewPreferences without reading legacy storage", () => {
    const storage = createMemoryStorage({
      [ENTRY_DETAIL_STORAGE_KEYS.answerHide]: "true",
    });

    expect(
      resolveViewPreferences(
        { hideAnswers: false, sheetLayout: "columns", fontSize: "large" },
        { storage },
      ),
    ).toEqual({
      sheetLayout: "columns",
      fontSize: "large",
      hideAnswers: false,
      showDifficulty: true,
      showOriginalPages: true,
      showLearningVisuals: true,
      compactToolbar: false,
      lectureLayout: "document",
    });
  });

  it("migrates when viewPreferences is missing", () => {
    const storage = createMemoryStorage({
      [ENTRY_DETAIL_STORAGE_KEYS.sheetLayout]: "columns",
    });

    expect(resolveViewPreferences(undefined, { storage }).sheetLayout).toBe("columns");
  });
});

describe("sibling preference normalizers", () => {
  it("normalizes exam preferences with current UX defaults", () => {
    expect(normalizeExamPreferences(undefined)).toEqual(DEFAULT_EXAM_PREFERENCES);
    expect(normalizeExamPreferences({ showTimer: true, autoAdvanceOnAnswer: true })).toEqual({
      ...DEFAULT_EXAM_PREFERENCES,
      showTimer: true,
      autoAdvanceOnAnswer: true,
    });
  });

  it("normalizes image preferences", () => {
    expect(normalizeImagePreferences(undefined)).toEqual(DEFAULT_IMAGE_PREFERENCES);
    expect(normalizeImagePreferences({ thumbnailSize: "tiny", showUnlinkedImages: false })).toEqual({
      preserveSourcePages: true,
      showUnlinkedImages: false,
      thumbnailSize: "medium",
    });
  });


  it("migrates legacy GPT/MCP and exam preference field names", () => {
    expect(normalizeExamPreferences({ showOriginalPages: false })).toEqual({
      ...DEFAULT_EXAM_PREFERENCES,
      showOriginalPages: false,
    });
    expect(
      normalizeGptMcpPreferences({
        mcpShareScope: "current-question",
        importReviewExpanded: true,
        importDetailCollapsedByDefault: true,
      }),
    ).toEqual({
      mcpShareScope: "current-question",
      importReviewExpanded: true,
      importDetailCollapsedByDefault: true,
    });
  });
  it("normalizes GPT/MCP preferences", () => {
    expect(normalizeGptMcpPreferences(undefined)).toEqual(DEFAULT_GPT_MCP_PREFERENCES);
    expect(
      normalizeGptMcpPreferences({
        mcpShareScope: "session-summary",
        importReviewExpanded: true,
      }),
    ).toEqual({
      mcpShareScope: "session-summary",
      importReviewExpanded: true,
      importDetailCollapsedByDefault: true,
    });
  });

  it("prefers explicit showSourcePages over legacy showOriginalPages alias", () => {
    expect(normalizeExamPreferences({ showSourcePages: false })).toEqual({
      ...DEFAULT_EXAM_PREFERENCES,
      showOriginalPages: false,
    });
    expect(normalizeExamPreferences({ showOriginalPages: false, showSourcePages: true })).toEqual({
      ...DEFAULT_EXAM_PREFERENCES,
      showOriginalPages: false,
    });
  });

  it("normalizes legacy GPT/MCP share scope aliases", () => {
    expect(normalizeGptMcpPreferences({ mcpShareScope: "active-question" })).toEqual({
      ...DEFAULT_GPT_MCP_PREFERENCES,
      mcpShareScope: "current-question",
    });
    expect(normalizeGptMcpPreferences({ mcpShareScope: "off" })).toEqual({
      ...DEFAULT_GPT_MCP_PREFERENCES,
      mcpShareScope: "submitted-result",
    });
  });
});

describe("normalizeSettings integration", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("migrates legacy settings without viewPreferences and keeps answerViewPreferences in sync", () => {
    localStorage.setItem(ENTRY_DETAIL_STORAGE_KEYS.sheetLayout, "columns");
    localStorage.setItem(ENTRY_DETAIL_STORAGE_KEYS.focusTextSize, "large");
    localStorage.setItem(ENTRY_DETAIL_STORAGE_KEYS.answerHide, "true");

    const legacy = {
      templates: [],
      promptTemplates: [],
      memoTemplates: [],
      aiProvider: {
        type: "manual" as const,
        enabled: false,
        keySource: "env" as const,
        hasStoredKey: false,
      },
      importPreferences: { lastPromptTemplateId: "builtin-sheet-answer-json" },
      answerViewPreferences: { viewMode: "table" as const, hideAnswers: false },
      autoBackup: { enabled: false },
      mcpBridge: { enabled: false, port: 43129 },
    };

    const normalized = normalizeSettings(legacy as unknown as AppSettings);

    expect(normalized.viewPreferences).toEqual({
      sheetLayout: "columns",
      fontSize: "large",
      hideAnswers: true,
      showDifficulty: true,
      showOriginalPages: true,
      showLearningVisuals: true,
      compactToolbar: false,
      lectureLayout: "document",
    });
    expect(normalized.answerViewPreferences).toEqual({
      viewMode: "table",
      hideAnswers: true,
    });
    expect(normalized.examPreferences).toEqual(DEFAULT_EXAM_PREFERENCES);
    expect(normalized.imagePreferences).toEqual(DEFAULT_IMAGE_PREFERENCES);
    expect(normalized.gptMcpPreferences).toEqual(DEFAULT_GPT_MCP_PREFERENCES);
    expect(normalized.importPreferences.lastPromptTemplateId).toBe("builtin-sheet-answer-json");
  });

  it("preserves saved viewPreferences and syncs hideAnswers into answerViewPreferences", () => {
    const normalized = normalizeSettings({
      ...normalizeSettings({} as AppSettings),
      viewPreferences: {
        ...DEFAULT_VIEW_PREFERENCES,
        hideAnswers: true,
        compactToolbar: true,
      },
      answerViewPreferences: {
        viewMode: "card",
        hideAnswers: false,
      },
    });

    expect(normalized.viewPreferences.hideAnswers).toBe(true);
    expect(normalized.answerViewPreferences.hideAnswers).toBe(true);
    expect(normalized.viewPreferences.compactToolbar).toBe(true);
  });
});
