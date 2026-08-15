import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamSession, GeneratedExam, WrongAnswerEntry } from "../types";
import type { AppSettings } from "../models/settings";
import type { LibraryFolder } from "../models/library";
import type { GptSolutionRoundtripDraft } from "../features/gpt-solution-roundtrip/model";
import type { ImportWorkspace } from "../features/import-workspace/model/importWorkspace";
import type { StorageBackend } from "./storageBackend";

const { invoke, isTauri } = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri }));

const BRIDGE_URL = "http://127.0.0.1:43131";
const BRIDGE_TOKEN = "test-token";

function representativeStores() {
  const entry = {
    id: "entry-1",
    subject: "수학",
    title: "이차방정식",
    question: "x^2 - 1 = 0",
    questionImages: [],
    entryKind: "wrong_answer",
    difficult: true,
    myAnswer: "1",
    correctAnswer: "±1",
    explanationParts: [],
    memo: "재복습",
    annotations: [],
    tags: ["대수"],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    mastered: false,
  } as unknown as WrongAnswerEntry;
  const settings = {
    templates: [],
    promptTemplates: [],
    memoTemplates: [],
    aiProvider: { type: "manual", enabled: false, keySource: "env", hasStoredKey: false },
    importPreferences: { lastPromptTemplateId: "prompt-1" },
    viewPreferences: { sheetLayout: "single", fontSize: "normal", hideAnswers: false, showDifficulty: true, showOriginalPages: true, showLearningVisuals: true, compactToolbar: false, problemSheetDisplayMode: "questions", questionSolutionPresentation: "dialog", lectureBlockDefaultState: "first" },
    examPreferences: { showScratchNote: true, showOriginalPages: true, showNavigator: true, autoAdvanceOnAnswer: false, warnUnansweredOnSubmit: true, showTimer: true, showMcpHelp: false },
    examPrintPreferences: { preset: "real_exam", paperSize: "a4", orientation: "portrait", layout: "single", includeHeader: true, includeAnswerSheet: true, includePageNumbers: true, includeSourcePages: false, workspaceSize: "normal", extraScratchPages: 0 },
    imagePreferences: { preserveSourcePages: true, showUnlinkedImages: false, thumbnailSize: "medium" },
    gptMcpPreferences: { mcpShareScope: "current-question", importReviewExpanded: true, importDetailCollapsedByDefault: false },
    chatGptMcpPreferences: { displayName: "학습자", shareUserResponse: true, shareScratchNote: false, shareQuestionImages: true, shareSourcePageImages: false, copyPromptBeforeOpen: true, openChatGptAfterCopy: false },
    answerViewPreferences: { viewMode: "card", hideAnswers: false },
    autoBackup: { enabled: false },
    mcpBridge: { enabled: false, port: 43129 },
    updatePreferences: { autoCheckEnabled: true, notificationsEnabled: true, backupBeforeInstall: true, channel: "stable" },
  } as unknown as AppSettings;
  const examSession = {
    id: "session-1",
    entryId: entry.id,
    title: "8월 모의고사",
    subject: "수학",
    status: "in_progress",
    questions: [],
    responses: [],
    currentQuestionIndex: 0,
    startedAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:01:00.000Z",
    mode: "practice",
  } as unknown as ExamSession;
  const generatedExam = {
    id: "generated-1",
    title: "약점 보완 세트",
    subject: "수학",
    preset: "weakness",
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    seed: "seed-1",
    status: "ready",
    questions: [],
    generationReport: {
      candidateCount: 1,
      selectedCount: 0,
      excludedCounts: {},
      difficultyDistribution: {},
      unitDistribution: {},
      sourceDistribution: {},
      relaxedConstraints: [],
      warnings: [],
      usedGeminiEvaluation: false,
      generatedAt: "2026-08-04T00:00:00.000Z",
    },
  } as unknown as GeneratedExam;
  const folder = {
    id: "folder-1",
    name: "수학",
    sortOrder: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  } as LibraryFolder;
  const gptDraft = {
    id: "gpt-draft-1",
    entryId: entry.id,
    status: "shared",
    updatedAt: "2026-08-05T00:00:00.000Z",
  } as unknown as GptSolutionRoundtripDraft;
  const importDraft = {
    id: "import-draft-1",
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    status: "ready",
    sourceFiles: [],
    assets: [],
    groups: [],
    unassignedBlocks: [],
    excludedBlocks: [],
    warnings: [],
    revision: 1,
  } as ImportWorkspace;

  return { entries: [entry], settings, examSessions: [examSession], generatedExams: [generatedExam], libraryFolders: [folder], gptDrafts: [gptDraft], importDraft };
}

function storePayloads(stores: ReturnType<typeof representativeStores>): Record<string, unknown> {
  return {
    entries: stores.entries,
    settings: stores.settings,
    "exam-sessions": stores.examSessions,
    "generated-exams": stores.generatedExams,
    "library-folders": stores.libraryFolders,
    "gpt-solution-drafts": stores.gptDrafts,
    "import-workspace-draft": stores.importDraft,
  };
}

async function loadRepresentativeStores(backend: StorageBackend) {
  return {
    entries: await backend.loadEntries(),
    settings: await backend.loadSettings(),
    examSessions: await backend.loadExamSessions(),
    generatedExams: await backend.loadGeneratedExams(),
    libraryFolders: await backend.loadLibraryFolders(),
    gptDrafts: await backend.loadGptSolutionDrafts(),
    importDraft: await backend.loadImportWorkspaceDraft(),
  };
}

describe("storage backend registry", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    invoke.mockReset();
    isTauri.mockReset();
    isTauri.mockReturnValue(false);
    localStorage.clear();
  });

  it("uses isolated storage only when no desktop bridge was configured", async () => {
    const { getStorageBackend } = await import("./storageBackend");
    const backend = getStorageBackend();
    expect(backend.kind).toBe("isolated-browser");
    await backend.saveEntries([]);
    expect(await backend.loadEntries()).toEqual([]);
  });

  it("keeps representative store payloads compatible between Tauri and the proxy", async () => {
    const stores = representativeStores();
    const tauriValues = storePayloads(stores);
    isTauri.mockReturnValue(true);
    invoke.mockImplementation(async (command: string) => {
      if (!command.startsWith("load_")) return undefined;
      const storeName = command.slice(5).replace("gpt_solution_roundtrip_drafts", "gpt-solution-drafts").replaceAll("_", "-");
      return tauriValues[storeName];
    });

    const tauri = (await import("./storageBackend")).getStorageBackend();
    const tauriLoaded = await loadRepresentativeStores(tauri);
    expect(tauriLoaded).toEqual({
      entries: stores.entries,
      settings: stores.settings,
      examSessions: stores.examSessions,
      generatedExams: stores.generatedExams,
      libraryFolders: stores.libraryFolders,
      gptDrafts: stores.gptDrafts,
      importDraft: stores.importDraft,
    });
    await tauri.saveEntries(stores.entries);
    await tauri.saveSettings(stores.settings);
    await tauri.saveExamSessions(stores.examSessions);
    await tauri.saveGeneratedExams(stores.generatedExams);
    await tauri.saveLibraryFolders(stores.libraryFolders);
    await tauri.saveGptSolutionDrafts(stores.gptDrafts);
    await tauri.saveImportWorkspaceDraft(stores.importDraft);
    expect(invoke).toHaveBeenCalledWith("save_entries", { entries: stores.entries });
    expect(invoke).toHaveBeenCalledWith("save_settings", { settings: stores.settings });
    expect(invoke).toHaveBeenCalledWith("save_exam_sessions", { sessions: stores.examSessions });
    expect(invoke).toHaveBeenCalledWith("save_generated_exams", { exams: stores.generatedExams });
    expect(invoke).toHaveBeenCalledWith("save_library_folders", { folders: stores.libraryFolders });
    expect(invoke).toHaveBeenCalledWith("save_gpt_solution_roundtrip_drafts", { drafts: stores.gptDrafts });
    expect(invoke).toHaveBeenCalledWith("save_import_workspace_draft", { draft: stores.importDraft });

    vi.resetModules();
    isTauri.mockReturnValue(false);
    vi.stubEnv("VITE_DESKTOP_STORAGE_BRIDGE_URL", BRIDGE_URL);
    vi.stubEnv("VITE_DESKTOP_STORAGE_BRIDGE_TOKEN", BRIDGE_TOKEN);
    const savedByProxy = new Map<string, unknown>();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const name = new URL(String(input)).pathname.split("/").pop() ?? "";
      if (init?.method === "PUT") {
        savedByProxy.set(name, JSON.parse(String(init.body)));
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(tauriValues[name]), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const proxy = (await import("./storageBackend")).getStorageBackend();
    const proxyLoaded = await loadRepresentativeStores(proxy);
    expect(proxyLoaded).toEqual(tauriLoaded);
    await proxy.saveEntries(stores.entries);
    await proxy.saveSettings(stores.settings);
    await proxy.saveExamSessions(stores.examSessions);
    await proxy.saveGeneratedExams(stores.generatedExams);
    await proxy.saveLibraryFolders(stores.libraryFolders);
    await proxy.saveGptSolutionDrafts(stores.gptDrafts);
    await proxy.saveImportWorkspaceDraft(stores.importDraft);
    expect(savedByProxy).toEqual(new Map(Object.entries(tauriValues)));
    expect(fetch).toHaveBeenCalledTimes(14);
  });

  it("does not fall back to localStorage when the desktop proxy disconnects", async () => {
    vi.stubEnv("VITE_DESKTOP_STORAGE_BRIDGE_URL", BRIDGE_URL);
    vi.stubEnv("VITE_DESKTOP_STORAGE_BRIDGE_TOKEN", BRIDGE_TOKEN);
    localStorage.setItem("wrong-answer-entries", JSON.stringify([{ id: "must-not-load" }]));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connection refused"); }));
    const { getStorageBackend } = await import("./storageBackend");
    const backend = getStorageBackend();
    expect(backend.kind).toBe("desktop-proxy");
    await expect(backend.loadEntries()).rejects.toThrow("저장소 연결이 끊어졌습니다");
    expect(localStorage.getItem("wrong-answer-entries")).toContain("must-not-load");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends the bearer token on proxy store requests", async () => {
    vi.stubEnv("VITE_DESKTOP_STORAGE_BRIDGE_URL", BRIDGE_URL);
    vi.stubEnv("VITE_DESKTOP_STORAGE_BRIDGE_TOKEN", "secret-token");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    const { getStorageBackend } = await import("./storageBackend");
    await getStorageBackend().loadEntries();
    expect(fetch).toHaveBeenCalledWith(
      `${BRIDGE_URL}/v1/stores/entries`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer secret-token" }) }),
    );
  });

  it("removes a legacy import draft only after the Tauri save succeeds", async () => {
    const draft = representativeStores().importDraft;
    localStorage.setItem("wrong-answer-import-workspace-draft", JSON.stringify(draft));
    isTauri.mockReturnValue(true);
    invoke.mockImplementation(async (command: string) => {
      if (command === "load_import_workspace_draft") return null;
      if (command === "save_import_workspace_draft") throw new Error("remote unavailable");
      return undefined;
    });
    const tauri = (await import("./storageBackend")).getStorageBackend();

    await expect(tauri.loadImportWorkspaceDraft()).rejects.toThrow("remote unavailable");
    expect(localStorage.getItem("wrong-answer-import-workspace-draft")).not.toBeNull();

    invoke.mockResolvedValue(undefined);
    await expect(tauri.loadImportWorkspaceDraft()).resolves.toEqual(draft);
    expect(localStorage.getItem("wrong-answer-import-workspace-draft")).toBeNull();
  });

  it("keeps a legacy import draft when the proxy migration save fails", async () => {
    const draft = representativeStores().importDraft;
    localStorage.setItem("wrong-answer-import-workspace-draft", JSON.stringify(draft));
    vi.stubEnv("VITE_DESKTOP_STORAGE_BRIDGE_URL", BRIDGE_URL);
    vi.stubEnv("VITE_DESKTOP_STORAGE_BRIDGE_TOKEN", BRIDGE_TOKEN);
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") throw new Error("remote unavailable");
      return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const proxy = (await import("./storageBackend")).getStorageBackend();

    await expect(proxy.loadImportWorkspaceDraft()).rejects.toThrow("저장소 연결이 끊어졌습니다");
    expect(localStorage.getItem("wrong-answer-import-workspace-draft")).not.toBeNull();
  });
});
