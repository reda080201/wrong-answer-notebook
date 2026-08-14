import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppActions } from "./useAppActions";
import * as api from "../api";
import type {
  WrongAnswerEntry,
  AppSettings,
  EntryFormData,
} from "../types";
import type { EntryPatch } from "./useEntries";
import type { LearningBlock } from "../models/learning";

// Mock all external dependencies
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock("../api", () => ({
  cleanupOrphanImages: vi.fn(),
  applyBrowserBackupAtomically: vi.fn(),
  createBackupAtDestination: vi.fn(async () => "Backup created"),
  deleteImage: vi.fn(),
  previewOrphanImages: vi.fn(),
  rewriteImportAssetReferences: vi.fn((data) => data),
  restoreBackupFromSource: vi.fn(async () => ({ entries: [], settings: {} })),
  selectBackupDestination: vi.fn(),
  selectBackupSource: vi.fn(),
  saveImportAssetFiles: vi.fn(async () => ({ savedFilenames: [], sourceToSaved: {} })),
  runNativeIntegrityCheck: vi.fn(),
}));

vi.mock("../utils/duplicates", () => ({
  findDuplicateEntries: vi.fn(() => []),
}));

vi.mock("../utils/entry", () => ({
  getEntryTitle: vi.fn((entry) => entry?.title || "Untitled"),
}));

vi.mock("../utils/gptSolution", () => ({
  entryToFormData: vi.fn((entry) => entry),
  mergeGptSolutionIntoEntry: vi.fn((form1, form2) => ({ ...form1, ...form2 })),
}));

vi.mock("../utils/sheetGroup", () => ({
  resolveSheetGroupId: vi.fn(() => "group-id"),
}));

vi.mock("../utils/integrity", () => ({
  runClientIntegrityCheck: vi.fn(() => ({ issues: [] })),
}));

vi.mock("../utils/review", () => ({
  applyReviewResult: vi.fn((entry) => entry),
  getDifficultReviewItems: vi.fn(() => []),
  getImportantQuestionReviewItems: vi.fn(() => []),
  getRandomReviewItems: vi.fn(() => []),
  getTodayReviewItems: vi.fn(() => []),
}));

vi.mock("../utils/questionMeta", () => ({
  applyQuestionReviewResult: vi.fn(),
  normalizeQuestionMeta: vi.fn((meta) => meta || []),
  normalizeQuestionNumber: vi.fn((num) => num),
}));

vi.mock("../utils/importImageReferences", () => ({
  collectEntryImportImageReferences: vi.fn(() => []),
}));

vi.mock("../features/supplemental-resources/services/mergeAnswerKey", () => ({
  applyAnswerMerge: vi.fn((target) => target),
  analyzeAnswerMerge: vi.fn(() => ({ rows: [] })),
  mergeResourceLink: vi.fn((entry) => entry),
}));

vi.mock("../features/supplemental-resources/model/supplementalResource", () => ({
  allowedFieldsForSupplementalMode: vi.fn(() => []),
  filterSupplementalData: vi.fn((data) => data),
  supplementalKindForMode: vi.fn(() => "answer"),
}));

vi.mock("../shared/ui/AppDialogProvider", () => ({
  useAppDialog: vi.fn(() => ({
    confirm: vi.fn(async () => true),
    prompt: vi.fn(async ({ title }) => title),
  })),
}));

// Test fixtures
const createMockEntry = (overrides?: Partial<WrongAnswerEntry>): WrongAnswerEntry => ({
  id: "entry-1",
  entryKind: "wrong_answer",
  subject: "수학",
  title: "Test Entry",
  question: "Test question?",
  questionImages: [],
  sourcePageImages: [],
  myAnswer: "My answer",
  correctAnswer: "Correct answer",
  explanationParts: [],
  difficult: false,
  difficulty: "none",
  difficultyScore: 0,
  annotations: [],
  tags: [],
  answerKey: [],
  figures: [],
  memo: "",
  mistakeAnalysis: { causes: [] },
  mastered: false,
  review: {
    dueAt: null,
    intervalDays: 0,
    streak: 0,
    history: [],
  },
  learningBlocks: [],
  sourceType: "html",
  linkedEntryIds: [],
  concepts: [],
  checklist: [],
  questionMeta: [],
  importAudit: {
    expectedQuestionNumbers: [],
    detectedQuestionNumbers: [],
    missingQuestionNumbers: [],
    uncertainQuestionNumbers: [],
    handwritingExcluded: false,
    needsReviewCount: 0,
  },
  rejectedNotes: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockSettings = (overrides?: Partial<AppSettings>): AppSettings => ({
  templates: [],
  promptTemplates: [],
  memoTemplates: [],
  aiProvider: {
    type: "manual",
    enabled: false,
    keySource: "env",
    hasStoredKey: false,
  },
  importPreferences: {},
  viewPreferences: {
    sheetLayout: "single",
    fontSize: "normal",
    hideAnswers: false,
    showDifficulty: true,
    showOriginalPages: true,
    showLearningVisuals: true,
    compactToolbar: false,
    problemSheetDisplayMode: "questions",
    questionSolutionPresentation: "split",
    lectureBlockDefaultState: "first",
  },
  examPreferences: {
    showScratchNote: true,
    showOriginalPages: true,
    showNavigator: true,
    autoAdvanceOnAnswer: false,
    warnUnansweredOnSubmit: true,
    showTimer: false,
    showMcpHelp: false,
  },
  examPrintPreferences: {
    preset: "real_exam",
    paperSize: "a4",
    orientation: "portrait",
    layout: "single",
    includeHeader: true,
    includeAnswerSheet: false,
    includePageNumbers: true,
    includeSourcePages: false,
    workspaceSize: "normal",
    extraScratchPages: 0,
  },
  imagePreferences: {
    preserveSourcePages: true,
    showUnlinkedImages: false,
    thumbnailSize: "medium",
  },
  gptMcpPreferences: {
    mcpShareScope: "current-question",
    importReviewExpanded: false,
    importDetailCollapsedByDefault: true,
  },
  chatGptMcpPreferences: {
    displayName: "Notebook",
    shareUserResponse: true,
    shareScratchNote: false,
    shareQuestionImages: true,
    shareSourcePageImages: false,
    copyPromptBeforeOpen: true,
    openChatGptAfterCopy: false,
  },
  answerViewPreferences: {
    viewMode: "card",
    hideAnswers: false,
  },
  autoBackup: {
    enabled: false,
  },
  mcpBridge: {
    enabled: false,
    port: 3100,
  },
  updatePreferences: {
    autoCheckEnabled: true,
    notificationsEnabled: true,
    backupBeforeInstall: true,
    channel: "stable",
  },
  ...overrides,
});

const createMockFormData = (overrides?: Partial<EntryFormData>): EntryFormData => ({
  subject: "수학",
  title: "New Entry",
  question: "New question?",
  questionImages: [],
  sourcePageImages: [],
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  entryKind: "wrong_answer",
  difficult: false,
  difficulty: "none",
  annotations: [],
  tags: [],
  answerKey: [],
  figures: [],
  memo: "",
  mistakeAnalysis: { causes: [] },
  mastered: false,
  learningBlocks: [],
  sourceType: "html",
  linkedEntryIds: [],
  concepts: [],
  checklist: [],
  questionMeta: [],
  sheetGroup: undefined,
  importAudit: {
    expectedQuestionNumbers: [],
    detectedQuestionNumbers: [],
    missingQuestionNumbers: [],
    uncertainQuestionNumbers: [],
    handwritingExcluded: false,
    needsReviewCount: 0,
  },
  rejectedNotes: [],
  ...overrides,
});

describe("useAppActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createHook = (
    overrides: Partial<Parameters<typeof useAppActions>[0]> = {},
  ) => {
    return renderHook(() =>
      useAppActions({
        entries: [],
        settings: createMockSettings(),
        selected: null,
        activeSection: "wrong_answer",
        subjectFilter: null,
        addEntry: vi.fn(async () => "new-entry-id"),
        addEntries: vi.fn(async () => ["entry-1"]),
        addEntriesWithImportAssetSession: vi.fn(async () => ["id"]),
        updateEntry: vi.fn(async () => {}),
        deleteEntry: vi.fn(async () => {}),
        patchEntry: vi.fn(async () => {}),
        patchEntryWithImportAssetSession: vi.fn(async () => {}),
        refresh: vi.fn(async () => true),
        upsertTemplate: vi.fn(async () => {}),
        removeTemplate: vi.fn(async () => {}),
        upsertPromptTemplate: vi.fn(async () => {}),
        removePromptTemplate: vi.fn(async () => {}),
        upsertMemoTemplate: vi.fn(async () => {}),
        removeMemoTemplate: vi.fn(async () => {}),
        patchSettings: vi.fn(async () => {}),
        refreshSettings: vi.fn(async () => true),
        refreshExamSessions: vi.fn(async () => true),
        refreshGeneratedExams: vi.fn(async () => true),
        refreshLibraryFolders: vi.fn(async () => true),
        refreshGptSolutionDrafts: vi.fn(async () => true),
        setActiveSection: vi.fn(),
        setSelectedId: vi.fn(),
        ...overrides,
      }),
    );
  };

  describe("handleSave - new entry", () => {
    it("saves new entry with correct data", async () => {
      const addEntry = vi.fn(async () => "new-entry-id");
      const setSelectedId = vi.fn();
      const { result } = createHook({ addEntry, setSelectedId });
      const formData = createMockFormData({ title: "Test Problem" });

      await act(async () => {
        await result.current.handleSave(formData, []);
      });

      expect(addEntry).toHaveBeenCalledWith(expect.objectContaining({
        title: "Test Problem",
        question: "New question?",
      }));
      expect(setSelectedId).toHaveBeenCalledWith("new-entry-id");
    });

    it("saves entry with sheet group metadata", async () => {
      const addEntry = vi.fn(async () => "entry-id");
      const { result } = createHook({ addEntry });
      const formData = createMockFormData({
        entryKind: "problem_sheet",
        sheetGroup: {
          groupId: "group-1",
          groupTitle: "2024 모의고사",
          partTitle: "1단원",
          partOrder: 1,
        },
      });

      await act(async () => {
        await result.current.handleSave(formData, []);
      });

      expect(addEntry).toHaveBeenCalledWith(expect.objectContaining({
        entryKind: "problem_sheet",
        sheetGroup: expect.objectContaining({
          groupTitle: "2024 모의고사",
          partTitle: "1단원",
        }),
      }));
    });
  });

  describe("handleSave - update entry", () => {
    it("updates existing entry when editing", async () => {
      const entry = createMockEntry({ id: "edit-id" });
      const updateEntry = vi.fn(async () => {});
      const setSelectedId = vi.fn();
      const { result } = createHook({ entries: [entry], updateEntry, setSelectedId });
      const formData = createMockFormData({ title: "Updated Title" });

      act(() => {
        result.current.openEditEntry(entry.id);
      });
      await act(async () => {
        await result.current.handleSave(formData, []);
      });

      expect(updateEntry).toHaveBeenCalledWith("edit-id", expect.any(Object), []);
      expect(setSelectedId).toHaveBeenCalledWith("edit-id");
    });

    it("removes specified images when updating", async () => {
      const entry = createMockEntry();
      const updateEntry = vi.fn(async () => {});
      const { result } = createHook({ entries: [entry], updateEntry });
      const formData = createMockFormData();
      const removedImages = ["image1.jpg", "image2.jpg"];

      act(() => {
        result.current.openEditEntry(entry.id);
      });
      await act(async () => {
        await result.current.handleSave(formData, removedImages);
      });

      expect(updateEntry).toHaveBeenCalledWith(entry.id, expect.any(Object), removedImages);
    });
  });

  describe("handleImportedEntriesApply", () => {
    it("imports single entry correctly", async () => {
      const addEntries = vi.fn(async () => ["imported-id"]);
      const setActiveSection = vi.fn();
      const setSelectedId = vi.fn();
      const { result } = createHook({ addEntries, setActiveSection, setSelectedId });
      const importedEntries = [createMockFormData({ title: "Imported Entry" })];

      await act(async () => {
        await result.current.handleImportedEntriesApply(importedEntries, []);
      });

      expect(addEntries).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ title: "Imported Entry" }),
        ]),
      );
      expect(setSelectedId).toHaveBeenCalledWith("imported-id");
    });

    it("imports batch of entries", async () => {
      const addEntries = vi.fn(async () => ["id1", "id2"]);
      const { result } = createHook({ addEntries });
      const importedEntries = [
        createMockFormData({ title: "Entry 1", subject: "수학" }),
        createMockFormData({ title: "Entry 2", subject: "영어" }),
      ];

      await act(async () => {
        await result.current.handleImportedEntriesApply(importedEntries, []);
      });

      expect(addEntries).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ title: "Entry 1" }),
          expect.objectContaining({ title: "Entry 2" }),
        ]),
      );
    });

    it("fills missing subject with default", async () => {
      const addEntries = vi.fn(async () => ["id"]);
      const { result } = createHook({ addEntries });
      const importedEntries = [
        createMockFormData({ subject: "unknown-subject" as EntryFormData["subject"] }),
      ];

      await act(async () => {
        await result.current.handleImportedEntriesApply(importedEntries, []);
      });

      expect(addEntries).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ subject: "기타" }),
        ]),
      );
    });

    it("does nothing when no entries provided", async () => {
      const addEntries = vi.fn(async () => []);
      const { result } = createHook({ addEntries });

      await act(async () => {
        await result.current.handleImportedEntriesApply([], []);
      });

      expect(addEntries).not.toHaveBeenCalled();
    });
  });

  describe("applySupplementalMerge", () => {
    it("applies merge to problem sheet entry", async () => {
      const entries = [createMockEntry({ entryKind: "problem_sheet" })];
      const patchEntry = vi.fn(async () => {});
      const { result } = createHook({ entries, patchEntry });
      const data = createMockFormData();

      await act(async () => {
        await result.current.applySupplementalMerge({
          entryId: entries[0].id,
          expectedUpdatedAt: entries[0].updatedAt,
          data,
          mode: "answer_key",
          title: "Updated Answers",
          resolutions: [],
        });
      });

      expect(patchEntry).toHaveBeenCalled();
    });

    it("throws error when entry not found", async () => {
      const { result } = createHook({ entries: [] });
      const data = createMockFormData();

      await act(async () => {
        try {
          await result.current.applySupplementalMerge({
            entryId: "nonexistent",
            expectedUpdatedAt: new Date().toISOString(),
            data,
            mode: "answer_key",
            title: "Test",
            resolutions: [],
          });
          expect.fail("Should have thrown");
        } catch (error) {
          expect((error as Error).message).toContain("찾을 수 없습니다");
        }
      });
    });
  });

  describe("handleBackup and handleRestore", () => {
    it("initiates backup operation", async () => {
      const entries = [createMockEntry()];
      const settings = createMockSettings();
      const { result } = createHook({ entries, settings });

      await act(async () => {
        await result.current.handleBackup();
      });

      // Test completes without error
      expect(true).toBe(true);
    });

    it("prevents concurrent backup/restore", async () => {
      const { result } = createHook();

      await act(async () => {
        void result.current.handleBackup().catch(() => {});
        try {
          void result.current.handleBackup().catch(() => {});
          // One should reject with maintenance error
        } catch (error) {
          expect((error as Error).message).toContain("진행 중");
        }
      });
    });

    it("reloads exam sessions after a browser backup restore", async () => {
      const refreshExamSessions = vi.fn(async () => true);
      const discardActiveSessionAfterRestore = vi.fn();
      vi.mocked(api.selectBackupSource).mockResolvedValue("backup.json");
      vi.mocked(api.restoreBackupFromSource).mockResolvedValue({ entries: [], settings: {} } as never);
      vi.mocked(api.applyBrowserBackupAtomically).mockReturnValue({ restored: true, warnings: [] });
      const { result } = createHook({ refreshExamSessions, discardActiveSessionAfterRestore });

      await act(async () => {
        await result.current.handleRestore();
      });

      expect(refreshExamSessions).toHaveBeenCalledTimes(1);
      expect(discardActiveSessionAfterRestore).toHaveBeenCalledTimes(1);
    });

    it("does not report a restore as complete when exam sessions cannot reload", async () => {
      const refreshExamSessions = vi.fn(async () => false);
      vi.mocked(api.selectBackupSource).mockResolvedValue("backup.json");
      vi.mocked(api.restoreBackupFromSource).mockResolvedValue({ entries: [], settings: {} } as never);
      vi.mocked(api.applyBrowserBackupAtomically).mockReturnValue({ restored: true, warnings: [] });
      const { result } = createHook({ refreshExamSessions });

      await expect(result.current.handleRestore()).rejects.toThrow("시험 세션");
      expect(refreshExamSessions).toHaveBeenCalledTimes(1);
    });

    it("keeps the active session when storage restoration fails", async () => {
      const discardActiveSessionAfterRestore = vi.fn();
      vi.mocked(api.selectBackupSource).mockResolvedValue("backup.json");
      vi.mocked(api.restoreBackupFromSource).mockRejectedValue(new Error("restore failed"));
      const { result } = createHook({ discardActiveSessionAfterRestore });

      await expect(result.current.handleRestore()).rejects.toThrow("restore failed");
      expect(discardActiveSessionAfterRestore).not.toHaveBeenCalled();
    });
  });

  describe("Review functionality", () => {
    it("starts today review mode", () => {
      const entries = [createMockEntry()];
      const { result } = createHook({ entries });

      act(() => {
        result.current.startReview("today");
      });

      expect(result.current.reviewMode).toBe("today");
    });

    it("starts random review mode", () => {
      const entries = [createMockEntry()];
      const { result } = createHook({ entries });

      act(() => {
        result.current.startReview("random");
      });

      expect(result.current.reviewMode).toBe("random");
    });

    it("starts difficult review mode", () => {
      const { result } = createHook();

      act(() => {
        result.current.startReview("difficult");
      });

      expect(result.current.reviewMode).toBe("difficult");
    });

    it("applies review result to entry", async () => {
      const entry = createMockEntry();
      const patchEntry = vi.fn(async () => {});
      const { result } = createHook({ entries: [entry], patchEntry });

      await act(async () => {
        await result.current.handleReview(entry, "good");
      });

      expect(patchEntry).toHaveBeenCalledWith(entry.id, expect.any(Function));
    });

    it("records review attempts with confidence level", async () => {
      const entry = createMockEntry();
      let capturedPatch: ((current: WrongAnswerEntry) => Partial<WrongAnswerEntry>) | null = null;
      const patchEntry = vi.fn(async (_id: string, fn: EntryPatch) => {
        if (typeof fn !== "function") {
          throw new Error("review patch was not functional");
        }
        capturedPatch = fn;
      });
      const { result } = createHook({ entries: [entry], patchEntry });

      await act(async () => {
        await result.current.handleReview(entry, "hard");
      });

      expect(capturedPatch).toBeTruthy();
      if (!capturedPatch) {
        throw new Error("review patch was not captured");
      }
      const updated = (capturedPatch as (current: WrongAnswerEntry) => Partial<WrongAnswerEntry>)(entry);
      expect(updated.reviewAttempts).toBeDefined();
      if (Array.isArray(updated.reviewAttempts) && updated.reviewAttempts.length > 0) {
        expect(updated.reviewAttempts[0]).toHaveProperty("confidence");
        expect(updated.reviewAttempts[0]).toHaveProperty("result");
      }
    });
  });

  describe("State management", () => {
    it("manages form visibility", () => {
      const { result } = createHook();

      expect(result.current.showForm).toBe(false);

      act(() => {
        result.current.openNew();
      });
      expect(result.current.showForm).toBe(true);

      act(() => {
        result.current.closeForm();
      });
      expect(result.current.showForm).toBe(false);
    });

    it("manages import modal visibility", () => {
      const { result } = createHook();

      expect(result.current.showImportModal).toBe(false);

      act(() => {
        result.current.openImport();
      });
      expect(result.current.showImportModal).toBe(true);

      act(() => {
        result.current.closeImportModal();
      });
      expect(result.current.showImportModal).toBe(false);
    });

    it("manages supplemental target state", () => {
      const entry = createMockEntry({ id: "entry-1", entryKind: "problem_sheet" });
      const { result } = createHook({ entries: [entry] });

      expect(result.current.supplementalTarget).toBe(null);

      act(() => {
        result.current.openSupplementalImport("entry-1", "answer_key");
      });
      expect(result.current.supplementalTarget).toBeDefined();
      expect(result.current.supplementalTarget?.entryId).toBe("entry-1");

      act(() => {
        result.current.closeSupplementalImport();
      });
      expect(result.current.supplementalTarget).toBe(null);
    });

    it("manages supplemental manager state", () => {
      const entry = createMockEntry({ id: "entry-1", entryKind: "problem_sheet" });
      const { result } = createHook({ entries: [entry] });

      expect(result.current.supplementalManagerEntryId).toBe(null);

      act(() => {
        result.current.openSupplementalManager("entry-1");
      });
      expect(result.current.supplementalManagerEntryId).toBe("entry-1");

      act(() => {
        result.current.closeSupplementalManager();
      });
      expect(result.current.supplementalManagerEntryId).toBe(null);
    });
  });

  describe("Template management", () => {
    it("saves entry template", async () => {
      const upsertTemplate = vi.fn(async () => {});
      const { result } = createHook({ upsertTemplate });
      const template = {
        id: "t1",
        name: "My Template",
        subject: "수학" as const,
        entryKind: "wrong_answer" as const,
        data: createMockFormData(),
      };

      await act(async () => {
        await result.current.saveTemplate(template);
      });

      expect(upsertTemplate).toHaveBeenCalledWith(template);
    });

    it("deletes template", async () => {
      const removeTemplate = vi.fn(async () => {});
      const { result } = createHook({ removeTemplate });

      await act(async () => {
        await result.current.deleteTemplate("t1");
      });

      expect(removeTemplate).toHaveBeenCalledWith("t1");
    });
  });

  describe("handleDelete", () => {
    it("deletes selected entry", async () => {
      const entry = createMockEntry();
      const deleteEntry = vi.fn(async () => {});
      const setSelectedId = vi.fn();
      const { result } = createHook({ selected: entry, deleteEntry, setSelectedId });

      await act(async () => {
        await result.current.handleDelete();
      });

      expect(deleteEntry).toHaveBeenCalledWith(entry.id);
      expect(setSelectedId).toHaveBeenCalledWith(null);
    });

    it("does nothing when no entry selected", async () => {
      const deleteEntry = vi.fn(async () => {});
      const { result } = createHook({ selected: null, deleteEntry });

      await act(async () => {
        await result.current.handleDelete();
      });

      expect(deleteEntry).not.toHaveBeenCalled();
    });
  });

  describe("Open and edit operations", () => {
    it("opens form with prefilled title", () => {
      const { result } = createHook();

      act(() => {
        result.current.openNewWithTitle("Pre-filled Title");
      });

      expect(result.current.showForm).toBe(true);
      expect(result.current.prefilledTitle).toBe("Pre-filled Title");
    });

    it("opens edit form for specific entry", () => {
      const entries = [createMockEntry({ id: "entry-to-edit" })];
      const { result } = createHook({ entries });

      act(() => {
        result.current.openEditEntry("entry-to-edit");
      });

      expect(result.current.showForm).toBe(true);
      expect(result.current.editingEntry).toBeDefined();
    });

    it("opens GPT solution import for selected entry", () => {
      const entry = createMockEntry();
      const { result } = createHook({ selected: entry });

      act(() => {
        result.current.openQuickGptSolution();
      });

      expect(result.current.showImportModal).toBe(true);
      expect(result.current.importMode).toBe("solution");
    });
  });

  describe("Settings operations", () => {
    it("sets settings message", () => {
      const { result } = createHook();

      act(() => {
        result.current.setSettingsMessage("Operation complete");
      });

      expect(result.current.settingsMessage).toBe("Operation complete");
    });

    it("clears settings message when set to null", () => {
      const { result } = createHook();

      act(() => {
        result.current.setSettingsMessage("Message");
        result.current.setSettingsMessage(null);
      });

      expect(result.current.settingsMessage).toBe(null);
    });
  });

  describe("Learning operations", () => {
    it("opens learning import modal", () => {
      const { result } = createHook();

      act(() => {
        result.current.setShowLearningImportModal(true);
      });

      expect(result.current.showLearningImportModal).toBe(true);

      act(() => {
        result.current.setShowLearningImportModal(false);
      });

      expect(result.current.showLearningImportModal).toBe(false);
    });

    it("manages learning entry link state", () => {
      const { result } = createHook();

      expect(result.current.supplementalLinkEntryId).toBe(null);

      act(() => {
        result.current.openLearningEntryLink("entry-id");
      });

      expect(result.current.supplementalLinkEntryId).toBe("entry-id");

      act(() => {
        result.current.closeLearningEntryLink();
      });

      expect(result.current.supplementalLinkEntryId).toBe(null);
    });
  });

  describe("Entry operations", () => {
    it("adds quick memo to entry", async () => {
      const entry = createMockEntry({ memo: "Existing" });
      const patchEntry = vi.fn(async (_id, recipe) => {
        if (typeof recipe === "function") recipe(entry);
      });
      const { result } = createHook({ patchEntry });

      await act(async () => {
        await result.current.handleQuickMemo(entry, "This is a memo");
      });

      expect(patchEntry).toHaveBeenCalledWith(entry.id, expect.any(Function));
      const recipe = patchEntry.mock.calls[0][1] as (current: typeof entry) => { memo: string };
      expect(recipe(entry).memo).toContain("This is a memo");
    });

    it("ignores empty memo text", async () => {
      const entry = createMockEntry();
      const patchEntry = vi.fn(async () => {});
      const { result } = createHook({ patchEntry });

      await act(async () => {
        await result.current.handleQuickMemo(entry, "   ");
      });

      expect(patchEntry).not.toHaveBeenCalled();
    });

    it("updates learning blocks", async () => {
      const entry = createMockEntry();
      const patchEntry = vi.fn(async () => {});
      const { result } = createHook({ patchEntry });
      const blocks: LearningBlock[] = [{ 
        id: "block-1", 
        type: "concept",
        title: "Block 1", 
        content: "Content" 
      }];

      await act(async () => {
        await result.current.handleLearningBlocksChange(entry, blocks);
      });

      expect(patchEntry).toHaveBeenCalledWith(entry.id, {
        learningBlocks: blocks,
      });
    });
  });
});
