import EntryForm from "./EntryForm";
import ImportFromGptModal from "./ImportFromGptModal";
import LearningImportModal from "./LearningImportModal";
import ReviewPanel from "./ReviewPanel";
import { generateImportWithAi } from "../api";
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
  setSettings: (settings: AppSettings) => Promise<void>;
  savePromptTemplate: (template: PromptTemplate) => Promise<void>;
  closeImportModal: () => void;
  handleImportApply: (
    data: Partial<EntryFormData>,
    applyMode?: GptSolutionApplyMode,
  ) => void;
  showLearningImportModal: boolean;
  setShowLearningImportModal: (show: boolean) => void;
  handleLearningImportApply: (
    blocks: LearningBlock[],
    meta: { title: string; sourceType: LectureSourceType },
  ) => Promise<void>;
  handleImportedEntriesApply: (
    entries: Partial<EntryFormData>[],
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
  setSettings,
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
}: AppModalsProps) {
  return (
    <>
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
          onPromptTemplateSelect={(templateId) =>
            setSettings({
              ...settings,
              importPreferences: {
                ...settings.importPreferences,
                lastPromptTemplateId: templateId,
              },
            })
          }
          onSavePromptTemplate={savePromptTemplate}
          sourceEntry={solutionSourceEntry}
          mode={importMode}
          onClose={closeImportModal}
          onApply={handleImportApply}
          onApplyEntries={handleImportedEntriesApply}
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
