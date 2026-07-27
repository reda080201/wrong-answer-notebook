import EntryForm from "./EntryForm";
import ImportFromGptModal from "./ImportFromGptModal";
import LearningImportModal from "./LearningImportModal";
import ReviewPanel from "./ReviewPanel";
import { generateImportWithAi } from "../api";
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
} from "../types";
import type { GptSolutionApplyMode } from "../utils/gptSolution";
import type { SettingsTab } from "./SettingsModal";
import ImportWorkspaceView from "../features/import-workspace/components/ImportWorkspaceView";
import type { ImportQuestionDraft, ImportWorkspace } from "../features/import-workspace/model/importWorkspace";
import { normalizeChoice } from "../features/import-workspace/model/importWorkspace";
import { parseQuestionText } from "../utils/textLayout";

interface AppModalsProps {
  showForm: boolean;
  editingEntry?: WrongAnswerEntry;
  handleSave: (data: EntryFormData, removedImages: string[]) => Promise<void>;
  closeForm: () => void;
  activeSection: EntryKind;
  prefilledTitle: string;
  importedInitialData?: Partial<EntryFormData>;
  settings: AppSettings;
  saveTemplate: (template: EntryTemplate) => Promise<void>;
  showImportModal: boolean;
  importMode: "import" | "solution";
  solutionSourceEntry?: WrongAnswerEntry;
  importFallbackSubject: Subject;
  aiProviderStatus: AiProviderStatus | null;
  setLastImportTemplate: (templateId: string) => Promise<void>;
  savePromptTemplate: (template: PromptTemplate) => Promise<void>;
  closeImportModal: () => void;
  handleImportApply: (
    data: Partial<EntryFormData>,
    applyMode?: GptSolutionApplyMode,
    assetFiles?: File[],
  ) => void;
  showLearningImportModal: boolean;
  setShowLearningImportModal: (show: boolean) => void;
  handleLearningImportApply: (
    blocks: LearningBlock[],
    meta: { title: string; sourceType: LectureSourceType },
  ) => Promise<void>;
  handleImportedEntriesApply: (
    entries: Partial<EntryFormData>[],
    assetFiles?: File[],
  ) => Promise<void>;
  reviewMode: "today" | "random" | "difficult" | "important" | null;
  reviewSeed: ReviewItem[];
  setReviewMode: (mode: "today" | "random" | "difficult" | "important" | null) => void;
  handleReview: (
    item: ReviewItem | WrongAnswerEntry,
    result: ReviewResult,
  ) => Promise<void>;
  setActiveSection: (section: EntryKind) => void;
  setSelectedId: (id: string | null) => void;
  handleWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  onOpenSettings?: (tab?: SettingsTab) => void;
}

export default function AppModals({
  showForm,
  editingEntry,
  handleSave,
  closeForm,
  activeSection,
  prefilledTitle,
  importedInitialData,
  settings,
  saveTemplate,
  showImportModal,
  importMode,
  solutionSourceEntry,
  importFallbackSubject,
  aiProviderStatus,
  setLastImportTemplate,
  savePromptTemplate,
  closeImportModal,
  handleImportApply,
  showLearningImportModal,
  setShowLearningImportModal,
  handleLearningImportApply,
  handleImportedEntriesApply,
  reviewMode,
  reviewSeed,
  setReviewMode,
  handleReview,
  setActiveSection,
  setSelectedId,
  handleWikiLinkClick,
  existingTargets,
  onOpenSettings,
}: AppModalsProps) {
  const [workspace, setWorkspace] = useState<ImportWorkspace | null>(null);
  const [workspaceAssetFiles, setWorkspaceAssetFiles] = useState<File[]>([]);
  const buildWorkspace = (items: Partial<EntryFormData>[], assetFiles: File[] = []): ImportWorkspace => {
    const now = new Date().toISOString();
    const groups = items.map((item, groupIndex) => {
      const groupId = `import-group-${uuidv4()}`;
      const blocks = parseQuestionText(item.question ?? "").filter((block) => block.kind === "question");
      const sourcePageAssets = item.sourcePageImages ?? item.questionImages ?? [];
      const questions: ImportQuestionDraft[] = blocks.length ? blocks.map((block, index) => ({ id: uuidv4(), groupId, order: index, displayQuestionNumber: String(block.displayNumber), sourceQuestionNumber: block.numberLabel, contentSegments: block.bodySegments.map((segment, segmentIndex) => ({ id: `segment-${segmentIndex + 1}`, type: segment.kind === "condition" ? "condition" : "text", text: segment.text, ...(segment.kind === "condition" ? { label: segment.label } : {}) } as never)), choices: block.choices.map((choice, choiceIndex) => normalizeChoice(`${choice.marker} ${choice.text}`, choiceIndex)), figures: (item.figures ?? []).filter((figure) => figure.questionNumber === block.numberLabel), sourcePageAssets, answer: item.answerKey?.find((answer) => answer.questionNumber === block.numberLabel) ? { ...item.answerKey.find((answer) => answer.questionNumber === block.numberLabel)!, id: uuidv4(), confirmed: false } : undefined, explanationParts: item.explanationParts ?? [], sourceReferences: [], status: "ready", warnings: [] })) : [{ id: uuidv4(), groupId, order: 0, displayQuestionNumber: "1", sourceQuestionNumber: "1", contentSegments: [{ id: "segment-1", type: "text", text: item.question ?? "" }], choices: [], figures: item.figures ?? [], sourcePageAssets, answer: item.answerKey?.[0] ? { ...item.answerKey[0], id: uuidv4() } : undefined, explanationParts: item.explanationParts ?? [], sourceReferences: [], status: item.question?.trim() ? "needs_review" : "invalid", warnings: item.question?.trim() ? [] : ["문항 본문이 비어 있습니다."] }];
      return { id: groupId, title: item.title ?? `가져온 회차 ${groupIndex + 1}`, subject: SUBJECTS.includes(item.subject as Subject) ? item.subject as Subject : undefined, confidence: .7, questions, answerItems: [], sourceFileIds: [], userConfirmed: false };
    });
    return { id: `workspace-${uuidv4()}`, createdAt: now, updatedAt: now, status: "review_required", sourceFiles: [], assets: [], assetSession: assetFiles.length ? { id: `memory-${uuidv4()}`, mode: "memory-only", assets: assetFiles.map((file) => ({ sourceName: file.name, size: file.size, lastModified: file.lastModified })) } : undefined, groups, unassignedBlocks: [], excludedBlocks: [], warnings: [], revision: 0 };
  };
  const handleWorkspaceEntries = async (items: Partial<EntryFormData>[], assetFiles?: File[]) => {
    const problemSheets = items.filter((item) => item.entryKind === "problem_sheet");
    if (problemSheets.length > 1) { setWorkspace(buildWorkspace(problemSheets, assetFiles)); setWorkspaceAssetFiles(assetFiles ?? []); return; }
    await handleImportedEntriesApply(items, assetFiles);
  };
  return (
    <>
      {workspace && <ImportWorkspaceView initialWorkspace={workspace} canRecoverAssets={(candidate) => !candidate.assetSession || candidate.assetSession.assets.every((asset) => workspaceAssetFiles.some((file) => file.name === asset.sourceName && file.size === asset.size && file.lastModified === asset.lastModified))} onSave={(items) => handleImportedEntriesApply(items, workspaceAssetFiles)} onClose={() => { setWorkspace(null); setWorkspaceAssetFiles([]); }} />}
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
          onOpenSettings={onOpenSettings}
          gptMcpPreferences={settings.gptMcpPreferences}
        />
      )}
      {showLearningImportModal && (
        <LearningImportModal
          onClose={() => setShowLearningImportModal(false)}
          onApply={handleLearningImportApply}
          onApplyEntries={handleImportedEntriesApply}
          mode={activeSection === "lecture" ? "lecture" : "append"}
        />
      )}
      {reviewMode && (
        <ReviewPanel
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
        />
      )}
    </>
  );
}
