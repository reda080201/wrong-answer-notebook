import TextReviewPanel from "../../../components/TextReviewPanel";
import type { SuspiciousTextSegment } from "../../../utils/suspiciousText";
import type { WrongAnswerEntry } from "../../../types";

interface EntryDetailReviewDialogsProps {
  open: boolean;
  entry: WrongAnswerEntry;
  segments: SuspiciousTextSegment[];
  onClose(): void;
  onQuestionTextChange?: (entry: WrongAnswerEntry, text: string) => Promise<void>;
  onStructuredQuestionsChange?: (entry: WrongAnswerEntry, questions: NonNullable<WrongAnswerEntry["structuredQuestions"]>) => Promise<void>;
  onToast(message: string): void;
}

export default function EntryDetailReviewDialogs({ open, entry, segments, onClose, onQuestionTextChange, onStructuredQuestionsChange, onToast }: EntryDetailReviewDialogsProps) {
  if (!open) return null;
  return <TextReviewPanel
    entry={entry}
    segments={segments}
    onClose={onClose}
    onSave={async (text) => {
      if (!onQuestionTextChange) return;
      await onQuestionTextChange(entry, text);
      onToast("검수한 문제 텍스트를 저장했습니다.");
    }}
    onStructuredQuestionsChange={async (target, questions) => {
      if (!onStructuredQuestionsChange) return;
      await onStructuredQuestionsChange(target, questions);
      onToast("구조화 문항을 저장했습니다.");
    }}
  />;
}
