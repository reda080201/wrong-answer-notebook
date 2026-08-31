import type {
  AiProviderStatus,
  LearningBlock,
  QuestionBankPreferences,
  WrongAnswerEntry,
} from "../types";
import LearningHubView from "../features/learning/components/LearningHubView";
import QuestionBankView from "../features/question-bank/components/QuestionBankView";
import { buildQuestionBankItems } from "../features/question-bank/utils/buildQuestionBankItems";
import { patchQuestionClassification, type QuestionMetaPatch } from "../features/question-bank/utils/patchQuestionClassification";
import type { TransientWriteRegistration } from "../hooks/useAppWriteRegistrations";
import { useMutationHistory } from "../hooks/useMutationHistory";

type EntryPatch = Partial<WrongAnswerEntry> | ((entry: WrongAnswerEntry) => Partial<WrongAnswerEntry>);

interface NotebookKnowledgeWorkspaceProps {
  mode: "question-bank" | "learning-hub";
  entries: WrongAnswerEntry[];
  learningHubTarget: { entryId: string; blockId: string } | null;
  questionBankPreferences?: QuestionBankPreferences;
  patchQuestionBankPreferences(patch: Partial<QuestionBankPreferences>): Promise<void>;
  registerQuestionBankPreferenceFlush(registration: TransientWriteRegistration): void;
  patchEntry(entryId: string, patch: EntryPatch): Promise<void>;
  openEntry(entry: WrongAnswerEntry, questionNumber?: string): void;
  openCandidateReview(entryId: string): void;
  aiProviderStatus?: AiProviderStatus | null;
  onOpenAiSettings?: () => void;
  registerScrollRestoration?: (key: string, element: HTMLElement | null) => void;
}

export default function NotebookKnowledgeWorkspace({
  mode,
  entries,
  learningHubTarget,
  questionBankPreferences,
  patchQuestionBankPreferences,
  registerQuestionBankPreferenceFlush,
  patchEntry,
  openEntry,
  openCandidateReview,
  aiProviderStatus,
  onOpenAiSettings,
  registerScrollRestoration,
}: NotebookKnowledgeWorkspaceProps) {
  const mutationHistory = useMutationHistory();
  const runBlockMutation = async (entryId: string, blockId: string, recipe: (blocks: LearningBlock[]) => { before: LearningBlock[]; after: LearningBlock[] }) => {
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (!entry) throw new Error("학습 자료를 찾지 못했습니다.");
    const currentBlocks = entry.learningBlocks ?? [];
    const { before, after } = recipe(currentBlocks);
    await mutationHistory.execute({
      label: "학습 블록 변경",
      redo: () => patchEntry(entryId, { learningBlocks: after }),
      undo: () => patchEntry(entryId, { learningBlocks: before }),
    });
    void blockId;
  };
  if (mode === "question-bank") {
    return (
      <QuestionBankView
        entries={entries}
        preferences={questionBankPreferences}
        onPreferencesChange={patchQuestionBankPreferences}
        onRegisterPreferenceFlush={registerQuestionBankPreferenceFlush}
        onRegisterScrollRestoration={registerScrollRestoration}
        onPatchQuestionClassification={(entryId, questionNumber, patch: QuestionMetaPatch) => patchEntry(entryId, (current) => ({
          questionMeta: patchQuestionClassification(current.questionMeta, questionNumber, patch),
        }))}
        onOpenQuestion={(item) => {
          const entry = entries.find((candidate) => candidate.id === item.entryId);
          if (entry) openEntry(entry, item.questionNumber);
        }}
      />
    );
  }

  return (
    <LearningHubView
      entries={entries}
      highlightedBlock={learningHubTarget}
      questionBankItems={buildQuestionBankItems(entries)}
      onOpenSource={(entryId, questionNumber) => {
        const entry = entries.find((item) => item.id === entryId);
        if (entry) openEntry(entry, questionNumber);
      }}
      onUpdateBlock={(entryId, blockId, patch) => runBlockMutation(entryId, blockId, (currentBlocks) => {
        const index = currentBlocks.findIndex((block) => block.id === blockId);
        if (index < 0) throw new Error("학습 카드를 찾지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
        const after = currentBlocks.map((block) => block.id === blockId
            ? { ...block, ...patch }
            : block);
        return { before: currentBlocks, after };
      })}
      onDuplicateBlock={(entryId, blockId) => runBlockMutation(entryId, blockId, (currentBlocks) => {
        const source = currentBlocks.find((block) => block.id === blockId);
        if (!source) throw new Error("학습 카드를 찾지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
        const duplicate: LearningBlock = {
          ...source,
          id: crypto.randomUUID(),
          title: `${source.title || "학습 내용"} 복제`,
          reviewStatus: "draft",
        };
        return { before: currentBlocks, after: [...currentBlocks, duplicate] };
      })}
      onDeleteBlock={(entryId, blockId) => runBlockMutation(entryId, blockId, (currentBlocks) => {
        if (!currentBlocks.some((block) => block.id === blockId)) {
          throw new Error("학습 카드를 찾지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
        }
        return { before: currentBlocks, after: currentBlocks.filter((block) => block.id !== blockId) };
      })}
      onOpenCandidateReview={openCandidateReview}
      aiProviderStatus={aiProviderStatus}
      onOpenAiSettings={onOpenAiSettings}
      onRegisterScrollRestoration={registerScrollRestoration}
    />
  );
}
