import type {
  LearningBlock,
  QuestionBankPreferences,
  WrongAnswerEntry,
} from "../types";
import LearningHubView from "../features/learning/components/LearningHubView";
import QuestionBankView from "../features/question-bank/components/QuestionBankView";
import { buildQuestionBankItems } from "../features/question-bank/utils/buildQuestionBankItems";
import { patchQuestionClassification, type QuestionMetaPatch } from "../features/question-bank/utils/patchQuestionClassification";
import type { TransientWriteRegistration } from "../hooks/useAppWriteRegistrations";

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
}: NotebookKnowledgeWorkspaceProps) {
  if (mode === "question-bank") {
    return (
      <QuestionBankView
        entries={entries}
        preferences={questionBankPreferences}
        onPreferencesChange={patchQuestionBankPreferences}
        onRegisterPreferenceFlush={registerQuestionBankPreferenceFlush}
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
      onUpdateBlock={(entryId, blockId, patch) => patchEntry(entryId, (current) => {
        const index = (current.learningBlocks ?? []).findIndex((block) => block.id === blockId);
        if (index < 0) throw new Error("학습 카드를 찾지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
        return {
          learningBlocks: (current.learningBlocks ?? []).map((block) => block.id === blockId
            ? { ...block, ...patch }
            : block),
        };
      })}
      onDuplicateBlock={(entryId, blockId) => patchEntry(entryId, (current) => {
        const source = (current.learningBlocks ?? []).find((block) => block.id === blockId);
        if (!source) throw new Error("학습 카드를 찾지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
        const duplicate: LearningBlock = {
          ...source,
          id: crypto.randomUUID(),
          title: `${source.title || "학습 내용"} 복제`,
          reviewStatus: "draft",
        };
        return { learningBlocks: [...(current.learningBlocks ?? []), duplicate] };
      })}
      onDeleteBlock={(entryId, blockId) => patchEntry(entryId, (current) => {
        const blocks = current.learningBlocks ?? [];
        if (!blocks.some((block) => block.id === blockId)) {
          throw new Error("학습 카드를 찾지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
        }
        return { learningBlocks: blocks.filter((block) => block.id !== blockId) };
      })}
      onOpenCandidateReview={openCandidateReview}
    />
  );
}
