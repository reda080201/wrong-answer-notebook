import EntryForm from "../features/entries/components/EntryForm";
import ImportFromGptModal from "../features/import/components/ImportFromGptModal";
import LearningImportModal, { type LearningImportAnalysis } from "./LearningImportModal";
import ReviewPanel from "./ReviewPanel";
import { deleteImage, discardImportAssetSession, generateImportWithAi, stageImportAssetFiles, validateImportAssetSession, type ImportAssetStageResult } from "../api";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { SUBJECTS } from "../types";
import type {
  AiProviderStatus,
  AppSettings,
  EntryFormData,
  EntryKind,
  EntryTemplate,
  LearningBlock,
  LectureSourceType,
  PromptTemplate,
  ReviewResult,
  ReviewItem,
  Subject,
  WrongAnswerEntry,
  ReviewSession,
} from "../types";
import type { GptSolutionApplyMode } from "../utils/gptSolution";
import type { SettingsTab } from "./SettingsModal";
import ImportWorkspaceView from "../features/import-workspace/components/ImportWorkspaceView";
import SupplementalMergeModal from "../features/supplemental-resources/components/SupplementalMergeModal";
import SupplementalResourceManagerModal from "../features/supplemental-resources/components/SupplementalResourceManagerModal";
import SupplementalLinkModal from "../features/supplemental-resources/components/SupplementalLinkModal";
import type { SupplementalImportMode } from "../features/supplemental-resources/model/supplementalResource";
import type { AnswerMergeResolution } from "../features/supplemental-resources/services/mergeAnswerKey";
import type { ImportQuestionDraft, ImportWorkspace } from "../features/import-workspace/model/importWorkspace";
import { normalizeChoice } from "../features/import-workspace/model/importWorkspace";
import { parseQuestionText } from "../utils/textLayout";
import { parseLectureImportText } from "../utils/learningContent";
import { rasterizeVisualImportFile } from "../utils/visualImportFiles";
import { normalizeQuestionNumber } from "../utils/questionMeta";
import type { TransientWriteRegistration } from "../hooks/useAppWriteRegistrations";
import type { AppModalControllerGroup } from "../hooks/useAppModalController";

type PendingSupplementalImport = {
  target: WrongAnswerEntry;
  expectedUpdatedAt: string;
  mode: SupplementalImportMode;
  data: Partial<EntryFormData>;
  assetFiles: File[];
  savedImageFilenames: string[];
  sourceFilename?: string;
  assetSession?: ImportWorkspace["assetSession"];
};

interface AppModalsProps {
  modalController?: AppModalControllerGroup;
  workspaceActions: { registerDraftFlush(registration: TransientWriteRegistration): void };
  form: { show: boolean; editingEntry?: WrongAnswerEntry; handleSave(data: EntryFormData, removedImages: string[]): Promise<void>; close(): void; activeSection: EntryKind; prefilledTitle: string; importedInitialData?: Partial<EntryFormData> };
  settings: { value: AppSettings; saveTemplate(template: EntryTemplate): Promise<void>; aiProviderStatus: AiProviderStatus | null; setLastImportTemplate(templateId: string): Promise<void>; savePromptTemplate(template: PromptTemplate): Promise<void>; open?(tab?: SettingsTab): void };
  importFlow: { show: boolean; mode: "import" | "solution"; solutionSourceEntry?: WrongAnswerEntry; fallbackSubject: Subject; close(): void; apply(data: Partial<EntryFormData>, applyMode?: GptSolutionApplyMode, assetFiles?: File[]): void; applyEntries(entries: Partial<EntryFormData>[], assetFiles?: File[], assetSession?: ImportWorkspace["assetSession"]): Promise<void> };
  learningImport: { show: boolean; setShow(show: boolean): void; apply(blocks: LearningBlock[], meta: { title: string; sourceType: LectureSourceType; sourcePageImages?: string[]; figures?: import("../types").SheetFigureItem[] }): Promise<void> };
  review: { mode: "today" | "random" | "difficult" | "important" | null; seed: ReviewItem[]; setMode(mode: "today" | "random" | "difficult" | "important" | null): void; handle(item: ReviewItem | WrongAnswerEntry, result: ReviewResult): Promise<void>; session?: ReviewSession; saveSession?: (session: ReviewSession) => Promise<void> };
  navigation: { setActiveSection(section: EntryKind): void; setSelectedId(id: string | null): void; handleWikiLinkClick(target: string): void; existingTargets: Set<string> };
  supplemental: { target?: { entry: WrongAnswerEntry; mode: SupplementalImportMode } | null; closeImport(): void; applyMerge(payload: { entryId: string; expectedUpdatedAt: string; data: Partial<EntryFormData>; mode: SupplementalImportMode; title: string; resolutions: AnswerMergeResolution[]; assetFiles: File[]; sourceFilename?: string; assetSession?: ImportWorkspace["assetSession"] }): Promise<void>; managerEntry?: WrongAnswerEntry | null; closeManager(): void; rename(entryId: string, resourceId: string, title: string): Promise<void>; remove(entryId: string, resourceId: string): Promise<void>; linkTarget?: WrongAnswerEntry | null; linkCandidates: WrongAnswerEntry[]; closeLink(): void; link(entryId: string, source: WrongAnswerEntry): Promise<void> };
}

export default function AppModals({
  modalController,
  workspaceActions, form, settings: settingsGroup, importFlow, learningImport, review, navigation, supplemental,
}: AppModalsProps) {
  const { registerDraftFlush: registerWorkspaceDraftFlush } = workspaceActions;
  const { show: showForm, editingEntry, handleSave, close: closeForm, activeSection, prefilledTitle, importedInitialData } = form;
  const { value: settings, saveTemplate, aiProviderStatus, setLastImportTemplate, savePromptTemplate, open: onOpenSettings } = settingsGroup;
  const { show: showImportModal, mode: importMode, solutionSourceEntry, fallbackSubject: importFallbackSubject, close: closeImportModal, apply: handleImportApply, applyEntries: handleImportedEntriesApply } = importFlow;
  const { show: showLearningImportModal, setShow: setShowLearningImportModal, apply: handleLearningImportApply } = learningImport;
  const { mode: reviewMode, seed: reviewSeed, setMode: setReviewMode, handle: handleReview, session: reviewSession, saveSession: saveReviewSession } = review;
  const { setActiveSection, setSelectedId, handleWikiLinkClick, existingTargets } = navigation;
  const { target: supplementalTarget, closeImport: onCloseSupplementalImport, applyMerge: applySupplementalMerge, managerEntry: supplementalManagerEntry, closeManager: onCloseSupplementalManager, rename: renameSupplementalResource, remove: deleteSupplementalResource, linkTarget: supplementalLinkTarget, linkCandidates: supplementalLinkCandidates, closeLink: onCloseSupplementalLink, link: onLinkLearningEntry } = supplemental;
  const openSettings = onOpenSettings ?? modalController?.settings.open;
  const [workspace, setWorkspace] = useState<ImportWorkspace | null>(null);
  const [workspaceAssetFiles, setWorkspaceAssetFiles] = useState<File[]>([]);
  const [pendingSupplemental, setPendingSupplemental] = useState<PendingSupplementalImport | null>(null);
  const [supplementalCleanupError, setSupplementalCleanupError] = useState<string | null>(null);
  const [supplementalCleanupBusy, setSupplementalCleanupBusy] = useState(false);
  const buildWorkspace = (items: Partial<EntryFormData>[], assetFiles: File[] = [], staged?: ImportAssetStageResult): ImportWorkspace => {
    const now = new Date().toISOString();
    const groups = items.map((item, groupIndex) => {
      const groupId = `import-group-${uuidv4()}`;
      const structuredQuestions = item.structuredQuestions ?? [];
      const blocks = structuredQuestions.length ? [] : parseQuestionText(item.question ?? "").filter((block) => block.kind === "question");
      const questionImageAssets = item.questionImages ?? [];
      const sourcePageAssets = item.sourcePageImages ?? [];
      const knownEntryKeys = new Set(["entryKind", "subject", "title", "question", "questionImages", "sourcePageImages", "questionSourceCrops", "problemSource", "importAudit", "questionMeta", "sheetGroup", "tags", "difficulty", "difficultyScore", "concepts", "checklist", "learningBlocks", "answerKey", "figures", "structuredQuestions", "questionContentSegments", "explanationParts", "memo", "annotations", "myAnswer", "correctAnswer", "difficult", "mastered"]);
      const findQuestionNumber = (value: string | number | undefined) => normalizeQuestionNumber(String(value ?? ""));
      const questions: ImportQuestionDraft[] = blocks.length
        ? blocks.map((block, index) => {
          const number = findQuestionNumber(block.numberLabel) || String(block.displayNumber);
          const figures = (item.figures ?? []).filter((figure) => findQuestionNumber(figure.questionNumber) === number);
          const answer = item.answerKey?.find((candidate) => findQuestionNumber(candidate.questionNumber) === number);
          return { id: uuidv4(), groupId, order: index, displayQuestionNumber: String(block.displayNumber), sourceQuestionNumber: block.numberLabel, conditions: [], equations: [], contentSegments: block.bodySegments.map((segment, segmentIndex) => ({ id: `segment-${segmentIndex + 1}`, type: segment.kind === "condition" ? "condition" : "text", text: segment.text, ...(segment.kind === "condition" ? { label: segment.label } : {}) } as never)), choices: block.choices.map((choice, choiceIndex) => normalizeChoice(`${choice.marker} ${choice.text}`, choiceIndex)), figures, questionImageAssets, sourcePageAssets, figureIds: figures.map((figure) => figure.id), answer: answer ? { ...answer, id: uuidv4(), confirmed: false } : undefined, explanationParts: [], sourceReferences: [], status: "ready", warnings: [] };
        })
        : structuredQuestions.length
          ? structuredQuestions.map((structured, index) => {
            const number = findQuestionNumber(structured.questionNumber) || String(index + 1);
            const figures = structured.figureIds.length
              ? (item.figures ?? []).filter((figure) => structured.figureIds.includes(figure.id))
              : (item.figures ?? []).filter((figure) => findQuestionNumber(figure.questionNumber) === number);
            const answer = item.answerKey?.find((candidate) => findQuestionNumber(candidate.questionNumber) === number);
            return { id: uuidv4(), groupId, order: index, displayQuestionNumber: number, sourceQuestionNumber: structured.questionNumber, section: structured.section, questionType: structured.questionType, conditions: [...structured.conditions], equations: [...structured.equations], points: structured.points, contentSegments: structured.contentSegments.map((segment) => segment.type === "table" ? { ...segment, rows: segment.rows.map((row) => [...row]) } : { ...segment }), choices: structured.choices.map((choice, choiceIndex) => normalizeChoice(choice, choiceIndex)), figures, questionImageAssets, sourcePageAssets, answer: answer ? { ...answer, id: uuidv4(), confirmed: false } : undefined, explanationParts: [], sourceReferences: [], status: structured.processingStatus ?? (structured.needsReview || structured.warning ? "needs_review" : "ready"), warnings: structured.warning ? [structured.warning] : [], needsReview: structured.needsReview, warning: structured.warning, source: structured.source ? { ...structured.source } : undefined, figureIds: [...structured.figureIds] };
          })
          : [{ id: uuidv4(), groupId, order: 0, displayQuestionNumber: "1", sourceQuestionNumber: "1", conditions: [], equations: [], contentSegments: [{ id: "segment-1", type: "text", text: item.question ?? "" }], choices: [], figures: item.figures ?? [], questionImageAssets, sourcePageAssets, figureIds: (item.figures ?? []).map((figure) => figure.id), answer: item.answerKey?.[0] ? { ...item.answerKey[0], id: uuidv4() } : undefined, explanationParts: [], sourceReferences: [], status: item.question?.trim() ? "needs_review" : "invalid", warnings: item.question?.trim() ? [] : ["문항 본문이 비어 있습니다."] }];
      return { id: groupId, title: item.title ?? `가져온 회차 ${groupIndex + 1}`, subject: SUBJECTS.includes(item.subject as Subject) ? item.subject as Subject : undefined, confidence: .7, entryMetadata: { problemSource: item.problemSource, importAudit: item.importAudit, questionMeta: item.questionMeta, sheetGroup: item.sheetGroup, tags: item.tags, difficulty: item.difficulty, difficultyScore: item.difficultyScore, concepts: item.concepts, checklist: item.checklist, learningBlocks: item.learningBlocks, questionSourceCrops: item.questionSourceCrops, unknownFields: Object.fromEntries(Object.entries(item).filter(([key]) => !knownEntryKeys.has(key))) }, explanationParts: item.explanationParts ?? [], questions, answerItems: [], sourceFileIds: [], userConfirmed: false };
    });
    return { id: `workspace-${uuidv4()}`, createdAt: now, updatedAt: now, status: "review_required", sourceFiles: [], assets: [], assetSession: assetFiles.length ? { id: staged?.sessionId ?? `memory-${uuidv4()}`, mode: staged ? "tauri-staged" : "memory-only", manifestVersion: staged ? 1 : undefined, createdAt: staged ? now : undefined, sourceToStaged: staged?.sourceToStaged, assets: staged?.assets ?? assetFiles.map((file) => ({ sourceName: file.name, size: file.size, lastModified: file.lastModified })) } : undefined, groups, unassignedBlocks: [], excludedBlocks: [], warnings: [], revision: 0 };
  };
  const handleWorkspaceEntries = async (items: Partial<EntryFormData>[], assetFiles?: File[]) => {
    const problemSheets = items.filter((item) => item.entryKind === "problem_sheet");
    if (problemSheets.length > 1) {
      const staged = await stageImportAssetFiles(assetFiles ?? []);
      setWorkspace(buildWorkspace(problemSheets, assetFiles, staged ?? undefined));
      setWorkspaceAssetFiles(assetFiles ?? []);
      return;
    }
    await handleImportedEntriesApply(items, assetFiles);
  };
  const validateWorkspaceAssets = async (candidate: ImportWorkspace) => {
    const assetSession = candidate.assetSession;
    if (!assetSession) return { valid: true, message: undefined };
    if (assetSession.mode === "tauri-staged") {
      const result = await validateImportAssetSession(assetSession);
      if (result.valid) return { valid: true, message: undefined };
      const details = [...result.missingFiles.map((name) => `누락: ${name}`), ...result.mismatchedFiles.map((name) => `변경됨: ${name}`)].join(", ");
      return { valid: false, message: `복구 초안의 staged 이미지 자산을 검증하지 못했습니다. ${details || "session이 없습니다."}` };
    }
    const valid = assetSession.assets.every((asset) => workspaceAssetFiles.some((file) => file.name === asset.sourceName && file.size === asset.size && file.lastModified === asset.lastModified));
    return { valid, message: valid ? undefined : "브라우저 초안의 이미지 자산은 현재 업로드와 일치하지 않습니다." };
  };
  const discardWorkspaceAssets = async (candidate: ImportWorkspace) => {
    if (candidate.assetSession?.mode === "tauri-staged") await discardImportAssetSession(candidate.assetSession.id);
  };
  const discardPendingSupplemental = async (pending: PendingSupplementalImport) => {
    setSupplementalCleanupBusy(true);
    setSupplementalCleanupError(null);
    let remainingSession = pending.assetSession;
    const remainingImages = [...pending.savedImageFilenames];
    try {
      if (pending.assetSession?.mode === "tauri-staged") {
        await discardImportAssetSession(pending.assetSession.id);
        remainingSession = undefined;
      }
      for (const filename of pending.savedImageFilenames) {
        await deleteImage(filename);
        remainingImages.splice(remainingImages.indexOf(filename), 1);
      }
      setPendingSupplemental(null);
    } catch (cleanupError) {
      // Retain only work that still needs cleanup. A failed staged-session discard
      // keeps its ID, so the user can retry without losing the recoverable assets.
      setPendingSupplemental((current) => current === pending
        ? { ...current, assetSession: remainingSession, savedImageFilenames: remainingImages }
        : current);
      setSupplementalCleanupError(
        cleanupError instanceof Error
          ? `임시 이미지 자산을 정리하지 못했습니다. ${cleanupError.message}`
          : "임시 이미지 자산을 정리하지 못했습니다. 다시 시도하거나 병합을 저장해 주세요.",
      );
    } finally {
      setSupplementalCleanupBusy(false);
    }
  };

  const analyzeLearningVisualFile = async (file: File): Promise<LearningImportAnalysis> => {
    const visualFiles = await rasterizeVisualImportFile(file);
    if (!visualFiles.every((candidate) => candidate.type.startsWith("image/"))) {
      throw new Error("이미지 또는 PDF 파일만 분석할 수 있습니다.");
    }

    const staged = await stageImportAssetFiles(visualFiles);
    if (!staged) throw new Error("이미지/PDF 분석은 데스크톱 저장소 연결에서만 사용할 수 있습니다.");
    const sourcePageImages = Object.values(staged.sourceToStaged);
    const assetSession = { id: staged.sessionId, mode: "tauri-staged" as const, manifestVersion: 1 as const, createdAt: new Date().toISOString(), sourceToStaged: staged.sourceToStaged, assets: staged.assets };
    try {
      const prompt = [
        "이미지에서 학습 자료를 추출해 JSON으로 반환하세요.",
        "learningBlocks 배열만 만들고, 확실하지 않은 제목/내용은 reviewStatus를 needs_review로 표시하세요.",
        "원본 이미지의 내용은 추측하지 말고, 사용자 검증 또는 verified 상태를 생성하지 마세요.",
      ].join("\n");
      const response = await generateImportWithAi(prompt, "이미지/PDF 기반 특강 자료를 분석하세요.", sourcePageImages);
      const parsed = parseLectureImportText(response, file.name);
      const genericTitle = /^(instruction|in'?sight|insight|concept|summary)$/i.test(parsed.title.trim());
      const blocks = parsed.blocks.map((block) => ({
        ...block,
        reviewStatus: genericTitle || block.reviewStatus === "reviewed" ? "needs_review" : block.reviewStatus ?? "draft",
      }));
      return {
        title: parsed.title,
        blocks,
        sourcePageImages,
        figures: [],
        assetSession,
        counts: {
          questions: 0,
          images: sourcePageImages.length,
          extracted: blocks.length,
          machineChecked: 0,
          needsReview: blocks.filter((block) => block.reviewStatus === "needs_review").length + (genericTitle ? 1 : 0),
        },
        issues: genericTitle
          ? [{ severity: "review_required", path: "title", message: "일반적인 자동 제목입니다. 원문에 맞는 제목인지 확인하세요." }]
          : [],
      };
    } catch (error) {
      await discardImportAssetSession(staged.sessionId).catch(() => undefined);
      throw error;
    }
  };

  return (
    <>
      {workspace && <ImportWorkspaceView initialWorkspace={workspace} registerDraftFlush={registerWorkspaceDraftFlush} validateRecoveryAssets={validateWorkspaceAssets} discardWorkspaceAssets={discardWorkspaceAssets} onSave={(items, assetSession) => handleImportedEntriesApply(items, assetSession?.mode === "tauri-staged" ? [] : workspaceAssetFiles, assetSession?.mode === "tauri-staged" ? assetSession : undefined)} onClose={() => { setWorkspace(null); setWorkspaceAssetFiles([]); }} />}
      {showForm && (
        <EntryForm
          entry={editingEntry}
          onSave={handleSave}
          onClose={closeForm}
          defaultEntryKind={activeSection}
          prefilledTitle={prefilledTitle}
          initialData={importedInitialData}
          templates={settings.templates}
          memoTemplates={settings.memoTemplates}
          onSaveTemplate={saveTemplate}
        />
      )}
      {showImportModal && (
        <ImportFromGptModal
          fallbackSubject={
            importMode === "solution" &&
            solutionSourceEntry &&
            SUBJECTS.includes(solutionSourceEntry.subject as Subject)
              ? (solutionSourceEntry.subject as Subject)
              : importFallbackSubject
          }
          promptTemplates={settings.promptTemplates}
          aiProvider={settings.aiProvider}
          aiProviderStatus={aiProviderStatus}
          onGenerateWithAi={(prompt, inputText, imageFilenames) =>
            generateImportWithAi(prompt, inputText, imageFilenames)
          }
          selectedPromptTemplateId={
            settings.importPreferences.lastPromptTemplateId
          }
          onPromptTemplateSelect={(templateId) => setLastImportTemplate(templateId)}
          onSavePromptTemplate={savePromptTemplate}
          sourceEntry={solutionSourceEntry}
          mode={importMode}
          onClose={closeImportModal}
          onApply={handleImportApply}
          onApplyEntries={handleWorkspaceEntries}
          onOpenSettings={openSettings}
          gptMcpPreferences={settings.gptMcpPreferences}
        />
      )}
      {supplementalTarget && !pendingSupplemental && (
        <ImportFromGptModal
          fallbackSubject={SUBJECTS.includes(supplementalTarget.entry.subject as Subject) ? supplementalTarget.entry.subject as Subject : "기타"}
          sourceEntry={supplementalTarget.entry}
          mode="supplemental"
          supplementalMode={supplementalTarget.mode}
          onClose={onCloseSupplementalImport}
          onApply={async (data, _applyMode, assetFiles = [], savedImageFilenames = [], sourceFilename) => {
            const staged = assetFiles.length ? await stageImportAssetFiles(assetFiles) : null;
            const assetSession = staged ? {
              id: staged.sessionId,
              mode: "tauri-staged" as const,
              manifestVersion: 1 as const,
              createdAt: new Date().toISOString(),
              sourceToStaged: staged.sourceToStaged,
              assets: staged.assets,
            } : undefined;
            setSupplementalCleanupError(null);
            setPendingSupplemental({ target: supplementalTarget.entry, expectedUpdatedAt: supplementalTarget.entry.updatedAt, mode: supplementalTarget.mode, data, assetFiles: staged ? [] : assetFiles, savedImageFilenames, sourceFilename, assetSession });
            onCloseSupplementalImport();
          }}
          onOpenSettings={openSettings}
        />
      )}
      {pendingSupplemental && (
        <SupplementalMergeModal
          target={pendingSupplemental.target}
          imported={pendingSupplemental.data}
          mode={pendingSupplemental.mode}
          assetFiles={pendingSupplemental.assetFiles}
          assetSession={pendingSupplemental.assetSession}
          cleanupError={supplementalCleanupError}
          cleanupBusy={supplementalCleanupBusy}
          onClose={() => void discardPendingSupplemental(pendingSupplemental)}
          onRetryCleanup={supplementalCleanupError ? () => void discardPendingSupplemental(pendingSupplemental) : undefined}
          onSave={async ({ data, mode, title, resolutions, assetFiles, assetSession }) => {
            await applySupplementalMerge({ entryId: pendingSupplemental.target.id, expectedUpdatedAt: pendingSupplemental.expectedUpdatedAt, data, mode, title, resolutions, assetFiles, sourceFilename: pendingSupplemental.sourceFilename, assetSession: pendingSupplemental.assetSession ?? assetSession });
            setSupplementalCleanupError(null);
            setPendingSupplemental(null);
          }}
        />
      )}
      {supplementalManagerEntry && (
        <SupplementalResourceManagerModal
          entry={supplementalManagerEntry}
          onClose={onCloseSupplementalManager}
          onRename={(resourceId, title) => renameSupplementalResource(supplementalManagerEntry.id, resourceId, title)}
          onDelete={(resourceId) => deleteSupplementalResource(supplementalManagerEntry.id, resourceId)}
        />
      )}
      {supplementalLinkTarget && (
        <SupplementalLinkModal
          target={supplementalLinkTarget}
          candidates={supplementalLinkCandidates.filter((entry) => entry.id !== supplementalLinkTarget.id)}
          onClose={onCloseSupplementalLink}
          onLink={(source) => onLinkLearningEntry(supplementalLinkTarget.id, source)}
        />
      )}
      {showLearningImportModal && (
        <LearningImportModal
          onClose={() => setShowLearningImportModal(false)}
          onApply={handleLearningImportApply}
          onApplyEntries={handleImportedEntriesApply}
          onDiscardAssetSession={(session) => session.mode === "tauri-staged" ? discardImportAssetSession(session.id) : undefined}
          mode={activeSection === "lecture" ? "lecture" : "append"}
          onVisualFile={analyzeLearningVisualFile}
        />
      )}
      {reviewMode && (
        <ReviewPanel
          mode={reviewMode}
          title={
            reviewMode === "today"
              ? "오늘 복습"
              : reviewMode === "important"
                ? "중요 문제 복습"
              : reviewMode === "difficult"
                ? "어려움 집중"
                : "랜덤 복습"
          }
          items={reviewSeed}
          onClose={() => setReviewMode(null)}
          onReview={handleReview}
          onOpenEntry={(entry) => {
            setActiveSection(entry.entryKind);
            setSelectedId(entry.id);
            setReviewMode(null);
          }}
          onWikiLinkClick={handleWikiLinkClick}
          existingTargets={existingTargets}
          session={reviewSession}
          onSessionSave={saveReviewSession}
        />
      )}
    </>
  );
}
