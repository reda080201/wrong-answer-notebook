import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  cleanupOrphanImages,
  createBackup,
  restoreBackup,
  runNativeIntegrityCheck,
} from "../api";
import { SUBJECTS } from "../types";
import type {
  AppSettings,
  EntryFormData,
  EntryKind,
  EntryTemplate,
  IntegrityReport,
  LearningBlock,
  LectureSourceType,
  MemoTemplate,
  PromptTemplate,
  ReviewResult,
  Subject,
  WrongAnswerEntry,
} from "../types";
import { findDuplicateEntries } from "../utils/duplicates";
import { getAllImageFilenames, getEntryTitle } from "../utils/entry";
import {
  entryToFormData,
  mergeGptSolutionIntoEntry,
  type GptSolutionApplyMode,
} from "../utils/gptSolution";
import { resolveSheetGroupId } from "../utils/sheetGroup";
import { runClientIntegrityCheck } from "../utils/integrity";
import {
  applyReviewResult,
  getDifficultReviewCandidates,
  getRandomReviewCandidates,
  getTodayReviewCandidates,
  shuffleEntries,
} from "../utils/review";

type ReviewMode = "today" | "random" | "difficult";
type ImportMode = "import" | "solution";

interface UseAppActionsOptions {
  entries: WrongAnswerEntry[];
  settings: AppSettings;
  selected: WrongAnswerEntry | null;
  activeSection: EntryKind;
  subjectFilter: string | null;
  addEntry: (form: EntryFormData) => Promise<string>;
  updateEntry: (
    id: string,
    form: EntryFormData,
    removedImages: string[],
  ) => Promise<void>;
  replaceEntries: (entries: WrongAnswerEntry[]) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  patchEntry: (
    id: string,
    partial: Partial<WrongAnswerEntry>,
  ) => Promise<void>;
  refresh: () => Promise<void>;
  setSettings: (settings: AppSettings) => Promise<void>;
  refreshSettings: () => Promise<void>;
  setActiveSection: (section: EntryKind) => void;
  setSelectedId: (id: string | null) => void;
}

export function useAppActions({
  entries,
  settings,
  selected,
  activeSection,
  subjectFilter,
  addEntry,
  updateEntry,
  replaceEntries,
  deleteEntry,
  patchEntry,
  refresh,
  setSettings,
  refreshSettings,
  setActiveSection,
  setSelectedId,
}: UseAppActionsOptions) {
  const [prefilledTitle, setPrefilledTitle] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showLearningImportModal, setShowLearningImportModal] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("import");
  const [solutionSourceEntry, setSolutionSourceEntry] =
    useState<WrongAnswerEntry | undefined>();
  const [importedInitialData, setImportedInitialData] =
    useState<Partial<EntryFormData> | undefined>();
  const [editingEntry, setEditingEntry] =
    useState<WrongAnswerEntry | undefined>();
  const [reviewMode, setReviewMode] = useState<ReviewMode | null>(null);
  const [reviewSeed, setReviewSeed] = useState<WrongAnswerEntry[]>([]);
  const [integrityReport, setIntegrityReport] =
    useState<IntegrityReport | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  const importFallbackSubject: Subject =
    subjectFilter && SUBJECTS.includes(subjectFilter as Subject)
      ? (subjectFilter as Subject)
      : "수학";

  const quickConceptSubject: Subject =
    subjectFilter && SUBJECTS.includes(subjectFilter as Subject)
      ? (subjectFilter as Subject)
      : "기타";

  const handleSave = async (
    data: EntryFormData,
    removedImages: string[],
  ) => {
    const preparedData: EntryFormData = {
      ...data,
      sheetGroup:
        data.entryKind === "problem_sheet" &&
        data.sheetGroup?.groupTitle.trim() &&
        data.sheetGroup?.partTitle.trim()
          ? {
              ...data.sheetGroup,
              groupId:
                data.sheetGroup.groupId ||
                resolveSheetGroupId(data.sheetGroup.groupTitle, entries),
              groupTitle: data.sheetGroup.groupTitle.trim(),
              partTitle: data.sheetGroup.partTitle.trim(),
              questionRange: data.sheetGroup.questionRange?.trim() || undefined,
              partOrder: Number.isFinite(Number(data.sheetGroup.partOrder))
                ? Number(data.sheetGroup.partOrder)
                : 1,
            }
          : undefined,
    };
    const duplicates = findDuplicateEntries(entries, preparedData, editingEntry?.id, 3);
    if (
      duplicates.length &&
      !confirm(
        [
          "비슷한 항목이 발견되었습니다. 그래도 저장할까요?",
          ...duplicates.map(
            ({ entry, score }) =>
              `- ${getEntryTitle(entry)} (${Math.round(score * 100)}%)`,
          ),
        ].join("\n"),
      )
    ) {
      throw new Error("중복 가능성이 있어 저장을 취소했습니다.");
    }

    if (editingEntry) {
      await updateEntry(editingEntry.id, preparedData, removedImages);
      setSelectedId(editingEntry.id);
    } else {
      const id = await addEntry(preparedData);
      setSelectedId(id);
    }
  };

  const handleQuickConceptCreate = async (data: EntryFormData) => {
    const sameTitle = entries.find(
      (entry) =>
        entry.entryKind === "concept" &&
        entry.title.trim().toLowerCase() === data.title.trim().toLowerCase(),
    );
    if (
      sameTitle &&
      !confirm(
        `"${getEntryTitle(sameTitle)}" 개념이 이미 있습니다. 그래도 새로 추가할까요?`,
      )
    ) {
      throw new Error("중복 가능성이 있어 저장을 취소했습니다.");
    }
    const id = await addEntry(data);
    setActiveSection("concept");
    setSelectedId(id);
  };

  const saveTemplate = async (template: EntryTemplate) => {
    await setSettings({
      ...settings,
      templates: [template, ...settings.templates],
    });
    setSettingsMessage("템플릿을 저장했습니다.");
  };

  const deleteTemplate = async (templateId: string) => {
    await setSettings({
      ...settings,
      templates: settings.templates.filter(
        (template) => template.id !== templateId,
      ),
    });
  };

  const savePromptTemplate = async (template: PromptTemplate) => {
    await setSettings({
      ...settings,
      promptTemplates: [
        template,
        ...settings.promptTemplates.filter((item) => item.id !== template.id),
      ],
    });
    setSettingsMessage("프롬프트 템플릿을 저장했습니다.");
  };

  const deletePromptTemplate = async (templateId: string) => {
    await setSettings({
      ...settings,
      promptTemplates: settings.promptTemplates.filter(
        (template) => template.id !== templateId || template.builtIn,
      ),
    });
  };

  const saveMemoTemplate = async (template: MemoTemplate) => {
    await setSettings({
      ...settings,
      memoTemplates: [
        template,
        ...settings.memoTemplates.filter((item) => item.id !== template.id),
      ],
    });
    setSettingsMessage("메모 템플릿을 저장했습니다.");
  };

  const deleteMemoTemplate = async (templateId: string) => {
    await setSettings({
      ...settings,
      memoTemplates: settings.memoTemplates.filter(
        (template) => template.id !== templateId || template.builtIn,
      ),
    });
  };

  const addMemoTemplate = async () => {
    const name = prompt("메모 템플릿 이름을 입력하세요.");
    if (!name?.trim()) return;
    const content = prompt("메모 템플릿 내용을 입력하세요.");
    if (!content?.trim()) return;
    await saveMemoTemplate({
      id: crypto.randomUUID(),
      name: name.trim(),
      content,
    });
  };

  const startReview = (mode: ReviewMode) => {
    const candidates =
      mode === "today"
        ? getTodayReviewCandidates(entries)
        : mode === "difficult"
          ? getDifficultReviewCandidates(entries)
          : shuffleEntries(getRandomReviewCandidates(entries));
    setReviewSeed(candidates);
    setReviewMode(mode);
  };

  const handleReview = async (
    entry: WrongAnswerEntry,
    result: ReviewResult,
  ) => {
    const next = applyReviewResult(entry, result);
    await patchEntry(entry.id, {
      review: next.review,
      mastered: next.mastered,
    });
  };

  const handleQuickMemo = async (entry: WrongAnswerEntry, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await patchEntry(entry.id, {
      memo: [entry.memo.trim(), trimmed].filter(Boolean).join("\n"),
    });
  };

  const handleLearningBlocksChange = async (
    entry: WrongAnswerEntry,
    blocks: LearningBlock[] = [],
  ) => {
    await patchEntry(entry.id, {
      learningBlocks: blocks,
    });
  };

  const createLectureEntry = async (
    blocks: LearningBlock[],
    meta: { title: string; sourceType: LectureSourceType },
    linkedEntryIds: string[] = [],
  ) => {
    const subject: Subject =
      subjectFilter && SUBJECTS.includes(subjectFilter as Subject)
        ? (subjectFilter as Subject)
        : selected && SUBJECTS.includes(selected.subject as Subject)
          ? (selected.subject as Subject)
          : "기타";
    const id = await addEntry({
      subject,
      title: meta.title.trim() || "특강자료",
      question: "",
      questionImages: [],
      entryKind: "lecture",
      difficult: false,
      difficulty: "none",
      annotations: [],
      myAnswer: "",
      correctAnswer: "",
      explanationParts: [],
      memo: "",
      tags: ["특강자료"],
      answerKey: [],
      figures: [],
      mistakeAnalysis: { causes: [] },
      mastered: false,
      learningBlocks: blocks,
      sourceType: meta.sourceType,
      linkedEntryIds,
      concepts: [],
      checklist: [],
    });
    setActiveSection("lecture");
    setSelectedId(id);
  };

  const handleLearningImportApply = async (
    blocks: LearningBlock[],
    meta: { title: string; sourceType: LectureSourceType },
  ) => {
    if (activeSection === "lecture" || !selected) {
      await createLectureEntry(blocks, meta, selected ? [selected.id] : []);
      return;
    }
    await patchEntry(selected.id, {
      learningBlocks: [...(selected.learningBlocks ?? []), ...blocks],
    });
  };

  const runIntegrity = async () => {
    const nativeReport = await runNativeIntegrityCheck().catch(() => null);
    const report = nativeReport ?? runClientIntegrityCheck(entries, settings);
    setIntegrityReport(report);
    setSettingsMessage(
      report.issues.length === 0
        ? "무결성 검사에서 문제가 발견되지 않았습니다."
        : `무결성 검사에서 ${report.issues.length}개 항목을 확인했습니다.`,
    );
  };

  const handleBackup = async () => {
    const message = await createBackup(entries, settings);
    setSettingsMessage(message);
    if (isTauri()) {
      await setSettings({
        ...settings,
        autoBackup: {
          ...settings.autoBackup,
          lastBackupAt: new Date().toISOString(),
        },
      });
    }
  };

  const handleRestore = async () => {
    if (!confirm("백업을 복원하면 현재 데이터가 덮어써질 수 있습니다. 계속할까요?")) return;
    const payload = await restoreBackup();
    if (payload) {
      await replaceEntries(payload.entries);
      await setSettings(payload.settings);
      for (const [key, value] of Object.entries(payload.browserImages ?? {})) {
        localStorage.setItem(key, value);
      }
    } else {
      await refresh();
      await refreshSettings();
    }
    setSettingsMessage("백업 복원을 완료했습니다.");
  };

  const handleCleanupOrphans = async () => {
    const removed = await cleanupOrphanImages(
      entries.flatMap(getAllImageFilenames),
    );
    setSettingsMessage(`사용하지 않는 이미지 ${removed}개를 정리했습니다.`);
  };

  const openNew = () => {
    if (activeSection === "lecture") {
      setShowLearningImportModal(true);
      return;
    }
    setPrefilledTitle("");
    setImportedInitialData(undefined);
    setEditingEntry(undefined);
    setShowForm(true);
  };

  const openNewWithTitle = (title: string) => {
    setPrefilledTitle(title);
    setImportedInitialData(undefined);
    setEditingEntry(undefined);
    setShowForm(true);
  };

  const openImport = () => {
    setImportMode("import");
    setSolutionSourceEntry(undefined);
    setShowImportModal(true);
  };

  const openQuickGptSolution = () => {
    if (!selected) return;
    setImportMode("solution");
    setSolutionSourceEntry(selected);
    setShowImportModal(true);
  };

  const openEdit = () => {
    if (selected) {
      setPrefilledTitle("");
      setImportedInitialData(undefined);
      setEditingEntry(selected);
      setShowForm(true);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm("이 항목을 삭제할까요? 첨부 이미지도 함께 삭제됩니다.")) return;
    await deleteEntry(selected.id);
    setSelectedId(null);
  };

  const handleImportApply = (
    data: Partial<EntryFormData>,
    applyMode?: GptSolutionApplyMode,
  ) => {
    if (importMode === "solution" && solutionSourceEntry) {
      const merged = mergeGptSolutionIntoEntry(
        entryToFormData(solutionSourceEntry),
        data,
        applyMode ?? "fill",
      );
      setImportedInitialData(undefined);
      setEditingEntry({
        ...solutionSourceEntry,
        ...merged,
      });
      setShowImportModal(false);
      setSolutionSourceEntry(undefined);
      setImportMode("import");
      setShowForm(true);
      return;
    }
    setImportedInitialData(data);
    setActiveSection(data.entryKind ?? "problem_sheet");
    setEditingEntry(undefined);
    setPrefilledTitle("");
    setShowImportModal(false);
    setSolutionSourceEntry(undefined);
    setImportMode("import");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingEntry(undefined);
    setPrefilledTitle("");
    setImportedInitialData(undefined);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setSolutionSourceEntry(undefined);
    setImportMode("import");
  };

  return {
    prefilledTitle,
    showForm,
    showImportModal,
    showLearningImportModal,
    setShowLearningImportModal,
    importMode,
    solutionSourceEntry,
    importedInitialData,
    editingEntry,
    reviewMode,
    setReviewMode,
    reviewSeed,
    integrityReport,
    settingsMessage,
    setSettingsMessage,
    importFallbackSubject,
    quickConceptSubject,
    handleSave,
    handleQuickConceptCreate,
    saveTemplate,
    deleteTemplate,
    savePromptTemplate,
    deletePromptTemplate,
    saveMemoTemplate,
    deleteMemoTemplate,
    addMemoTemplate,
    startReview,
    handleReview,
    handleQuickMemo,
    handleLearningBlocksChange,
    handleLearningImportApply,
    runIntegrity,
    handleBackup,
    handleRestore,
    handleCleanupOrphans,
    openNew,
    openNewWithTitle,
    openImport,
    openQuickGptSolution,
    openEdit,
    handleDelete,
    handleImportApply,
    closeForm,
    closeImportModal,
  };
}
