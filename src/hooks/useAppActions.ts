import { useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { isTauri } from "@tauri-apps/api/core";
import {
  cleanupOrphanImages,
  applyBrowserBackupAtomically,
  createBackupAtDestination,
  deleteImage,
  previewOrphanImages,
  rewriteImportAssetReferences,
  restoreBackupFromSource,
  selectBackupDestination,
  selectBackupSource,
  saveImportAssetFiles,
  runNativeIntegrityCheck,
} from "../api";
import type { ImportAssetSessionManifest } from "../features/import-workspace/model/importWorkspace";
import { SUBJECTS } from "../types";
import type {
  AppSettings,
  EntryFormData,
  EntryKind,
  EntryTemplate,
  IntegrityReport,
  LearningBlock,
  LectureSourceType,
  SheetFigureItem,
  MemoTemplate,
  PromptTemplate,
  ReviewResult,
  ReviewItem,
  Subject,
  WrongAnswerEntry,
} from "../types";
import { findDuplicateEntries } from "../utils/duplicates";
import { getEntryTitle } from "../utils/entry";
import {
  entryToFormData,
  mergeGptSolutionIntoEntry,
  type GptSolutionApplyMode,
} from "../utils/gptSolution";
import { resolveSheetGroupId } from "../utils/sheetGroup";
import { runClientIntegrityCheck } from "../utils/integrity";
import {
  applyReviewResult,
  getDifficultReviewItems,
  getImportantQuestionReviewItems,
  getRandomReviewItems,
  getTodayReviewItems,
} from "../utils/review";
import { applyQuestionReviewResult, normalizeQuestionMeta, normalizeQuestionNumber } from "../utils/questionMeta";
import { collectEntryImportImageReferences } from "../utils/importImageReferences";
import { applyAnswerMerge, analyzeAnswerMerge, mergeResourceLink, type AnswerMergeResolution } from "../features/supplemental-resources/services/mergeAnswerKey";
import { allowedFieldsForSupplementalMode, filterSupplementalData, supplementalKindForMode, type SupplementalImportMode } from "../features/supplemental-resources/model/supplementalResource";
import { useAppDialog } from "../shared/ui/AppDialogProvider";
import type { EntryPatch } from "./useEntries";

type ReviewMode = "today" | "random" | "difficult" | "important";
type ImportMode = "import" | "solution";

function shuffleReviewItems(items: ReviewItem[]): ReviewItem[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface UseAppActionsOptions {
  entries: WrongAnswerEntry[];
  settings: AppSettings;
  selected: WrongAnswerEntry | null;
  activeSection: EntryKind;
  subjectFilter: string | null;
  addEntry: (form: EntryFormData) => Promise<string>;
  addEntries: (forms: EntryFormData[]) => Promise<string[]>;
  addEntriesWithImportAssetSession: (sessionId: string, forms: EntryFormData[]) => Promise<string[]>;
  updateEntry: (
    id: string,
    form: EntryFormData,
    removedImages: string[],
  ) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  deleteEntryWithUndo?: (id: string, wasSelected?: boolean) => Promise<import("../types").PendingDeletion>;
  onPendingDeletion?: (pending: import("../types").PendingDeletion) => void;
  patchEntry: (
    id: string,
    partial: EntryPatch,
  ) => Promise<void>;
  patchEntryWithImportAssetSession: (
    id: string,
    expectedUpdatedAt: string,
    sessionId: string,
    partial: EntryPatch,
  ) => Promise<void>;
  refresh: () => Promise<boolean>;
  upsertTemplate: (template: EntryTemplate) => Promise<void>;
  removeTemplate: (templateId: string) => Promise<void>;
  upsertPromptTemplate: (template: PromptTemplate) => Promise<void>;
  removePromptTemplate: (templateId: string) => Promise<void>;
  upsertMemoTemplate: (template: MemoTemplate) => Promise<void>;
  removeMemoTemplate: (templateId: string) => Promise<void>;
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>;
  refreshSettings: () => Promise<boolean>;
  refreshExamSessions?: () => Promise<boolean>;
  discardActiveSessionAfterRestore?: () => void;
  refreshGeneratedExams?: () => Promise<boolean>;
  refreshLibraryFolders?: () => Promise<boolean>;
  refreshGptSolutionDrafts?: () => Promise<boolean>;
  runMaintenanceOperation?: <T>(task: () => Promise<T>) => Promise<T>;
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
  addEntries,
  addEntriesWithImportAssetSession,
  updateEntry,
  deleteEntry,
  deleteEntryWithUndo,
  onPendingDeletion,
  patchEntry,
  patchEntryWithImportAssetSession,
  refresh,
  upsertTemplate,
  removeTemplate,
  upsertPromptTemplate,
  removePromptTemplate,
  upsertMemoTemplate,
  removeMemoTemplate,
  patchSettings,
  refreshSettings,
  refreshExamSessions,
  discardActiveSessionAfterRestore,
  refreshGeneratedExams,
  refreshLibraryFolders,
  refreshGptSolutionDrafts,
  runMaintenanceOperation,
  setActiveSection,
  setSelectedId,
}: UseAppActionsOptions) {
  const { confirm, prompt } = useAppDialog();
  const maintenanceRef = useRef<Promise<void> | null>(null);
  const [prefilledTitle, setPrefilledTitle] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showLearningImportModal, setShowLearningImportModal] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("import");
  const [solutionSourceEntry, setSolutionSourceEntry] =
    useState<WrongAnswerEntry | undefined>();
  const [importedInitialData, setImportedInitialData] =
    useState<Partial<EntryFormData> | undefined>();
  const [pendingImportFiles, setPendingImportFiles] = useState<File[]>([]);
  const [supplementalTarget, setSupplementalTarget] = useState<{ entryId: string; mode: SupplementalImportMode } | null>(null);
  const [supplementalManagerEntryId, setSupplementalManagerEntryId] = useState<string | null>(null);
  const [supplementalLinkEntryId, setSupplementalLinkEntryId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] =
    useState<WrongAnswerEntry | undefined>();
  const [reviewMode, setReviewMode] = useState<ReviewMode | null>(null);
  const [reviewSeed, setReviewSeed] = useState<ReviewItem[]>([]);
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
      !(await confirm({
        title: "중복 항목 확인",
        message: [
          "비슷한 항목이 발견되었습니다. 그래도 저장할까요?",
          ...duplicates.map(
            ({ entry, score }) =>
              `- ${getEntryTitle(entry)} (${Math.round(score * 100)}%)`,
          ),
        ].join("\n"),
      }))
    ) {
      throw new Error("중복 가능성이 있어 저장을 취소했습니다.");
    }

    let savedFilenames: string[] = [];
    let finalData = preparedData;
    if (pendingImportFiles.length) {
      const importedAssets = await saveImportAssetFiles(pendingImportFiles);
      savedFilenames = importedAssets.savedFilenames;
      finalData = rewriteImportAssetReferences(preparedData, importedAssets.sourceToSaved);
    }
    try {
      if (editingEntry) {
        await updateEntry(editingEntry.id, finalData, removedImages);
        setSelectedId(editingEntry.id);
      } else {
        const id = await addEntry(finalData);
        setSelectedId(id);
      }
    } catch (error) {
      await Promise.all(savedFilenames.map((filename) => deleteImage(filename).catch(() => undefined)));
      throw error;
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
      !(await confirm({
        title: "중복 개념 확인",
        message: `"${getEntryTitle(sameTitle)}" 개념이 이미 있습니다. 그래도 새로 추가할까요?`,
      }))
    ) {
      throw new Error("중복 가능성이 있어 저장을 취소했습니다.");
    }
    const id = await addEntry(data);
    setActiveSection("concept");
    setSelectedId(id);
  };

  const saveTemplate = async (template: EntryTemplate) => {
    await upsertTemplate(template);
    setSettingsMessage("템플릿을 저장했습니다.");
  };

  const deleteTemplate = async (templateId: string) => {
    await removeTemplate(templateId);
  };

  const savePromptTemplate = async (template: PromptTemplate) => {
    await upsertPromptTemplate(template);
    setSettingsMessage("프롬프트 템플릿을 저장했습니다.");
  };

  const deletePromptTemplate = async (templateId: string) => {
    await removePromptTemplate(templateId);
  };

  const saveMemoTemplate = async (template: MemoTemplate) => {
    await upsertMemoTemplate(template);
    setSettingsMessage("메모 템플릿을 저장했습니다.");
  };

  const deleteMemoTemplate = async (templateId: string) => {
    await removeMemoTemplate(templateId);
  };

  const addMemoTemplate = async () => {
    const name = await prompt({ title: "메모 템플릿 이름", message: "메모 템플릿 이름을 입력하세요." });
    if (!name?.trim()) return;
    const content = await prompt({ title: "메모 템플릿 내용", message: "메모 템플릿 내용을 입력하세요." });
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
        ? getTodayReviewItems(entries)
        : mode === "important"
          ? getImportantQuestionReviewItems(entries)
        : mode === "difficult"
          ? getDifficultReviewItems(entries)
          : shuffleReviewItems(getRandomReviewItems(entries));
    setReviewSeed(candidates);
    setReviewMode(mode);
  };

  const handleReview = async (
    itemOrEntry: ReviewItem | WrongAnswerEntry,
    result: ReviewResult,
  ) => {
    const item: ReviewItem =
      "kind" in itemOrEntry
        ? itemOrEntry
        : { kind: "entry", entry: itemOrEntry };
    if (item.kind === "sheet-question") {
      await patchEntry(item.entry.id, (current) => {
        const questionMeta = normalizeQuestionMeta(current.questionMeta).find(
          (meta) => normalizeQuestionNumber(meta.questionNumber) === normalizeQuestionNumber(item.questionNumber),
        );
        return {
          questionMeta: applyQuestionReviewResult(
            current.questionMeta,
            item.questionNumber,
            result,
            new Date(),
            questionMeta?.mistakeAnalysis?.primaryCause,
          ),
          reviewAttempts: [
            ...(current.reviewAttempts ?? []),
            {
              id: uuidv4(),
              entryId: current.id,
              questionNumber: normalizeQuestionNumber(item.questionNumber),
              reviewedAt: new Date().toISOString(),
              correct: result !== "again",
              confidence: result === "again" ? "low" : result === "hard" ? "medium" : "high",
              result,
              mistakeCause: questionMeta?.mistakeAnalysis?.primaryCause,
            },
          ],
        };
      });
      return;
    }
    const entry = item.entry;
    await patchEntry(entry.id, (current) => {
      const next = applyReviewResult(current, result);
      return {
        review: next.review,
        mastered: next.mastered,
        reviewAttempts: [
          ...(current.reviewAttempts ?? []),
          {
            id: uuidv4(),
            entryId: current.id,
            reviewedAt: new Date().toISOString(),
            correct: result !== "again",
            confidence: result === "again" ? "low" : result === "hard" ? "medium" : "high",
            result,
            mistakeCause: current.mistakeAnalysis?.primaryCause,
          },
        ],
      };
    });
  };

  const handleQuickMemo = async (entry: WrongAnswerEntry, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await patchEntry(entry.id, (current) => ({
      memo: [current.memo.trim(), trimmed].filter(Boolean).join("\n"),
    }));
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
    meta: { title: string; sourceType: LectureSourceType; sourcePageImages?: string[]; figures?: SheetFigureItem[] },
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
      sourcePageImages: meta.sourcePageImages ?? [],
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
      figures: meta.figures ?? [],
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

  const handleImportedEntriesApply = async (
    importedEntries: Partial<EntryFormData>[],
    assetFiles: File[] = [],
    assetSession?: ImportAssetSessionManifest,
  ) => {
    if (!importedEntries.length) return;
    let sourceToSaved: Record<string, string> = {};
    let savedFilenames: string[] = [];
    if (assetSession?.mode === "tauri-staged") {
      sourceToSaved = assetSession.sourceToStaged ?? {};
    }
    if (assetSession?.mode !== "tauri-staged" && assetFiles.length) {
      const importedAssets = await saveImportAssetFiles(assetFiles);
      savedFilenames = importedAssets.savedFilenames;
      sourceToSaved = importedAssets.sourceToSaved;
    }
    try {
      const forms = importedEntries.map((rawImported): EntryFormData => {
      const imported = rewriteImportAssetReferences(rawImported, sourceToSaved);
      const entryKind: EntryKind =
        imported.entryKind === "wrong_answer" ||
        imported.entryKind === "problem_sheet" ||
        imported.entryKind === "concept" ||
        imported.entryKind === "lecture"
          ? imported.entryKind
          : "concept";
      const subject: Subject =
        imported.subject && SUBJECTS.includes(imported.subject as Subject)
          ? (imported.subject as Subject)
          : "기타";
      return {
        subject,
        title: imported.title?.trim() || (
          entryKind === "lecture"
            ? "특강자료"
            : entryKind === "concept"
              ? "개념"
              : "가져온 문제"
        ),
        question: imported.question ?? "",
        questionImages: imported.questionImages ?? [],
        sourcePageImages: imported.sourcePageImages ?? [],
        questionSourceCrops: imported.questionSourceCrops,
        entryKind,
        difficult: imported.difficult ?? false,
        difficulty: imported.difficulty ?? "none",
        difficultyScore: imported.difficultyScore,
        annotations: imported.annotations ?? [],
        myAnswer: imported.myAnswer ?? "",
        correctAnswer: imported.correctAnswer ?? "",
        explanationParts: imported.explanationParts ?? [],
        memo: imported.memo ?? "",
        tags: imported.tags ?? [],
        answerKey: imported.answerKey ?? [],
        figures: imported.figures ?? [],
        questionMeta: imported.questionMeta ?? [],
        structuredQuestions: imported.structuredQuestions,
        sheetGroup: imported.sheetGroup,
        importAudit: imported.importAudit,
        rejectedNotes: imported.rejectedNotes ?? [],
        mistakeAnalysis: imported.mistakeAnalysis ?? { causes: [] },
        review: imported.review,
        mastered: imported.mastered ?? false,
        learningBlocks: imported.learningBlocks ?? [],
        sourceType: imported.sourceType,
        linkedEntryIds: imported.linkedEntryIds ?? [],
        concepts: imported.concepts ?? [],
        checklist: imported.checklist ?? [],
      };
      });
      const ids = assetSession?.mode === "tauri-staged"
        ? await addEntriesWithImportAssetSession(assetSession.id, forms)
        : await addEntries(forms);
      setShowImportModal(false);
      setSolutionSourceEntry(undefined);
      setImportMode("import");
      setPendingImportFiles([]);
      setActiveSection(forms[0].entryKind);
      setSelectedId(ids[0] ?? null);
    } catch (error) {
      if (assetSession?.mode !== "tauri-staged") {
        await Promise.all(savedFilenames.map((filename) => deleteImage(filename).catch(() => undefined)));
      }
      throw error;
    }
  };

  const handleLearningImportApply = async (
    blocks: LearningBlock[],
    meta: { title: string; sourceType: LectureSourceType; sourcePageImages?: string[]; figures?: SheetFigureItem[]; assetSession?: ImportAssetSessionManifest },
  ) => {
    if (activeSection === "lecture" || !selected) {
      if (meta.assetSession?.mode === "tauri-staged") {
        await handleImportedEntriesApply([{
          entryKind: "lecture",
          subject: selected?.subject ?? "기타",
          title: meta.title,
          question: "",
          questionImages: [],
          sourcePageImages: meta.sourcePageImages ?? [],
          figures: meta.figures ?? [],
          learningBlocks: blocks,
        }], [], meta.assetSession);
        return;
      }
      await createLectureEntry(blocks, meta, selected ? [selected.id] : []);
      return;
    }
    if (meta.assetSession?.mode === "tauri-staged") {
      await patchEntryWithImportAssetSession(selected.id, selected.updatedAt, meta.assetSession.id, (current) => ({
        ...current,
        learningBlocks: [...(current.learningBlocks ?? []), ...blocks],
        sourcePageImages: [...new Set([...(current.sourcePageImages ?? []), ...(meta.sourcePageImages ?? [])])],
        figures: [...(current.figures ?? []), ...(meta.figures ?? [])],
      }));
      return;
    }
    await patchEntry(selected.id, (current) => ({
      learningBlocks: [...(current.learningBlocks ?? []), ...blocks],
      sourcePageImages: [...new Set([...(current.sourcePageImages ?? []), ...(meta.sourcePageImages ?? [])])],
      figures: [...(current.figures ?? []), ...(meta.figures ?? [])],
    }));
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
    if (maintenanceRef.current) throw new Error("백업 또는 복원이 진행 중입니다.");
    const destination = await selectBackupDestination();
    if (isTauri() && !destination) {
      setSettingsMessage("백업이 취소되었습니다.");
      return;
    }
    const operation = (async () => {
      const writeBackup = () => createBackupAtDestination(destination, entries, settings);
      const message = runMaintenanceOperation
        ? await runMaintenanceOperation(writeBackup)
        : await writeBackup();
      setSettingsMessage(message);
    })();
    maintenanceRef.current = operation;
    try {
      await operation;
    } finally {
      maintenanceRef.current = null;
    }
    if (isTauri()) {
      await patchSettings({ autoBackup: { ...settings.autoBackup, lastBackupAt: new Date().toISOString() } });
    }
  };

  const handleRestore = async () => {
    if (!(await confirm({ title: "백업 복원", message: "백업을 복원하면 현재 데이터가 덮어써질 수 있습니다. 계속할까요?" }))) return;
    if (maintenanceRef.current) throw new Error("백업 또는 복원이 진행 중입니다.");
    const source = await selectBackupSource();
    if (!source) return;
    const operation = (async () => {
      const restore = async () => {
        const payload = await restoreBackupFromSource(source);
        let restoreResult = payload;
        if (payload && "entries" in payload) {
          restoreResult = await applyBrowserBackupAtomically(payload);
        }
        discardActiveSessionAfterRestore?.();
        const reloads = await Promise.all([
          refresh(),
          refreshSettings(),
          refreshExamSessions?.(),
          refreshGeneratedExams?.(),
          refreshLibraryFolders?.(),
          refreshGptSolutionDrafts?.(),
        ]);
        const reloadNames = ["노트", "설정", "시험 세션", "생성 모의고사", "폴더", "GPT 해설 초안"];
        const failedReloads = reloads
          .map((success, index) => success !== true ? reloadNames[index] : null)
          .filter((name): name is string => name !== null);
        if (failedReloads.length) {
          throw new Error(`백업은 복원됐지만 ${failedReloads.join(", ")}을(를) 다시 불러오지 못했습니다. 해당 데이터를 다시 불러온 뒤 계속해 주세요.`);
        }
        return restoreResult;
      };
      const payload = runMaintenanceOperation
        ? await runMaintenanceOperation(restore)
        : await restore();
      setSettingsMessage(payload && "restored" in payload && payload.warnings.length
        ? `백업 복원을 완료했습니다. 경고 ${payload.warnings.length}개: ${payload.warnings.join(" ")}`
        : "백업 복원을 완료했습니다.");
    })();
    maintenanceRef.current = operation;
    try {
      await operation;
    } finally {
      maintenanceRef.current = null;
    }
  };

  const handleCleanupOrphans = async () => {
    const preview = await previewOrphanImages();
    if (!preview.filenames.length) {
      setSettingsMessage("정리할 미사용 이미지가 없습니다.");
      return;
    }
    const confirmed = await confirm({
      title: "미사용 이미지 정리",
      message: `사용하지 않는 이미지 ${preview.filenames.length}개(${Math.ceil(preview.totalBytes / 1024)}KB)를 삭제합니다. 계속하시겠습니까?`,
      confirmLabel: "삭제",
    });
    if (!confirmed) return;
    const removed = await cleanupOrphanImages();
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

  const openEditEntry = (entryId: string) => {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    setPrefilledTitle("");
    setImportedInitialData(undefined);
    setEditingEntry(entry);
    setShowForm(true);
  };

  const deleteEntryById = async (entryId: string) => {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    if (!(await confirm({ title: "항목 삭제", message: `"${getEntryTitle(entry)}"을(를) 삭제할까요? 첨부 이미지도 함께 삭제됩니다.`, confirmLabel: "삭제" }))) return;
    if (deleteEntryWithUndo) onPendingDeletion?.(await deleteEntryWithUndo(entryId, selected?.id === entryId));
    else await deleteEntry(entryId);
    if (selected?.id === entryId) setSelectedId(null);
  };

  const openSupplementalImport = (entryId: string, mode: SupplementalImportMode) => {
    if (!entries.some((entry) => entry.id === entryId && entry.entryKind === "problem_sheet")) return;
    setSupplementalManagerEntryId(null);
    setSupplementalTarget({ entryId, mode });
  };

  const closeSupplementalImport = () => setSupplementalTarget(null);
  const openSupplementalManager = (entryId: string) => {
    if (!entries.some((entry) => entry.id === entryId && entry.entryKind === "problem_sheet")) return;
    setSupplementalTarget(null);
    setSupplementalManagerEntryId(entryId);
  };
  const closeSupplementalManager = () => setSupplementalManagerEntryId(null);
  const openLearningEntryLink = (entryId: string) => setSupplementalLinkEntryId(entryId);
  const closeLearningEntryLink = () => setSupplementalLinkEntryId(null);
  const linkLearningEntry = async (entryId: string, source: WrongAnswerEntry) => {
    await patchEntry(entryId, (current) => mergeResourceLink(current, source.id, source.entryKind === "lecture" ? "lecture" : "concept", source.title));
    setSupplementalLinkEntryId(null);
  };

  const renameSupplementalResource = async (entryId: string, resourceId: string, title: string) => {
    await patchEntry(entryId, (current) => ({
      supplementalResources: (current.supplementalResources ?? []).map((resource) => resource.id === resourceId ? { ...resource, title, updatedAt: new Date().toISOString() } : resource),
    }));
  };

  const deleteSupplementalResource = async (entryId: string, resourceId: string) => {
    if (!(await confirm({ title: "추가 자료 이력 삭제", message: "이 기록만 삭제되며 이미 추가된 정답과 해설은 유지됩니다.", confirmLabel: "이력 삭제" }))) return;
    await patchEntry(entryId, (current) => ({
      supplementalResources: (current.supplementalResources ?? []).filter((resource) => resource.id !== resourceId),
    }));
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!(await confirm({ title: "항목 삭제", message: "이 항목을 삭제할까요? 첨부 이미지도 함께 삭제됩니다.", confirmLabel: "삭제" }))) return;
    if (deleteEntryWithUndo) onPendingDeletion?.(await deleteEntryWithUndo(selected.id, true));
    else await deleteEntry(selected.id);
    setSelectedId(null);
  };

  const handleImportApply = (
    data: Partial<EntryFormData>,
    applyMode?: GptSolutionApplyMode,
    assetFiles: File[] = [],
  ) => {
    if (importMode === "solution" && solutionSourceEntry) {
      const merged = mergeGptSolutionIntoEntry(
        entryToFormData(solutionSourceEntry),
        data,
        applyMode ?? "fill",
      );
      setImportedInitialData(undefined);
      setPendingImportFiles([]);
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
    setPendingImportFiles(assetFiles);
    setActiveSection(data.entryKind ?? "problem_sheet");
    setEditingEntry(undefined);
    setPrefilledTitle("");
    setShowImportModal(false);
    setSolutionSourceEntry(undefined);
    setImportMode("import");
    setShowForm(true);
  };

  const applySupplementalMerge = async ({
    entryId,
    expectedUpdatedAt,
    data,
    mode,
    title,
    resolutions,
    assetFiles = [],
    assetSession,
    sourceFilename,
  }: {
    entryId: string;
    expectedUpdatedAt: string;
    data: Partial<EntryFormData>;
    mode: SupplementalImportMode;
    title: string;
    resolutions: AnswerMergeResolution[];
    assetFiles?: File[];
    assetSession?: ImportAssetSessionManifest;
    sourceFilename?: string;
  }) => {
    const target = entries.find((entry) => entry.id === entryId);
    if (!target) throw new Error("대상 문제지를 찾을 수 없습니다.");
    let attemptSavedFilenames: string[] = [];
    try {
      let incoming = filterSupplementalData(data, mode);
      if (assetSession?.mode === "tauri-staged") {
        incoming = rewriteImportAssetReferences(incoming, assetSession.sourceToStaged ?? {});
      } else if (assetFiles.length) {
        const importedAssets = await saveImportAssetFiles(assetFiles);
        attemptSavedFilenames = importedAssets.savedFilenames;
        incoming = rewriteImportAssetReferences(incoming, importedAssets.sourceToSaved);
      }
      const analysis = analyzeAnswerMerge(target, incoming);
      const allowedFields = [...allowedFieldsForSupplementalMode(mode)];
      const resourceImages = collectEntryImportImageReferences(incoming);
      const now = new Date().toISOString();
      const appliedQuestions = analysis.rows
        .filter((row) => row.status !== "unmatched" && row.status !== "duplicate" && !resolutions.find((item) => item.key === row.key)?.excluded)
        .map((row) => row.questionNumber)
        .filter(Boolean);
      const resource = {
        id: uuidv4(),
        kind: supplementalKindForMode(mode),
        title: title.trim() || "추가 자료",
        createdAt: now,
        updatedAt: now,
        questionNumbers: [...new Set(appliedQuestions)],
        images: [...new Set(resourceImages)],
        sourceFilename,
        appliedFields: allowedFields,
      };
      const merge = (current: WrongAnswerEntry) =>
        applyAnswerMerge(current, incoming, resolutions, { allowedFields, resource });
      if (assetSession?.mode === "tauri-staged") {
        await patchEntryWithImportAssetSession(
          entryId,
          expectedUpdatedAt,
          assetSession.id,
          merge,
        );
      } else {
        await patchEntry(entryId, (current) => {
          if (current.updatedAt !== expectedUpdatedAt) {
            throw new Error("대상 문제지가 저장 중 변경되었습니다. 병합 내용을 다시 확인해 주세요.");
          }
          return merge(current);
        });
      }
      setSupplementalTarget(null);
    } catch (error) {
      await Promise.all(
        attemptSavedFilenames.map((filename) => deleteImage(filename).catch(() => undefined)),
      );
      throw error;
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingEntry(undefined);
    setPrefilledTitle("");
    setImportedInitialData(undefined);
    setPendingImportFiles([]);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setSolutionSourceEntry(undefined);
    setImportMode("import");
    setPendingImportFiles([]);
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
    pendingImportFiles,
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
    handleImportedEntriesApply,
    runIntegrity,
    handleBackup,
    handleRestore,
    handleCleanupOrphans,
    openNew,
    openNewWithTitle,
    openImport,
    openQuickGptSolution,
    openEdit,
    openEditEntry,
    deleteEntryById,
    supplementalTarget,
    supplementalManagerEntryId,
    openSupplementalImport,
    closeSupplementalImport,
    openSupplementalManager,
    closeSupplementalManager,
    renameSupplementalResource,
    deleteSupplementalResource,
    supplementalLinkEntryId,
    openLearningEntryLink,
    closeLearningEntryLink,
    linkLearningEntry,
    handleDelete,
    handleImportApply,
    applySupplementalMerge,
    closeForm,
    closeImportModal,
  };
}
