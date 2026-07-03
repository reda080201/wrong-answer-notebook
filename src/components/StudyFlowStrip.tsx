import type { WrongAnswerEntry } from "../types";

type DetailViewMode = "paper" | "solution" | "learning" | "analysis";

interface StudyFlowStripProps {
  entry: WrongAnswerEntry;
  focusAvailable: boolean;
  onModeChange: (mode: DetailViewMode) => void;
  onStartFocus: () => void;
}

type FlowStatus = "done" | "needed" | "warning" | "available";

function statusLabel(status: FlowStatus) {
  if (status === "done") return "완료";
  if (status === "warning") return "확인";
  if (status === "available") return "가능";
  return "필요";
}

export default function StudyFlowStrip({
  entry,
  focusAvailable,
  onModeChange,
  onStartFocus,
}: StudyFlowStripProps) {
  const hasQuestion = entry.question.trim() || entry.questionImages.length;
  const hasAnswer = (entry.answerKey?.length ?? 0) > 0 || entry.correctAnswer.trim();
  const hasLearning = (entry.learningBlocks?.length ?? 0) > 0;
  const hasReview = Boolean(entry.review?.dueAt || entry.review?.history.length || entry.mastered);
  const hasAuditWarning = Boolean((entry.importAudit?.missingQuestionNumbers.length ?? 0) > 0 || (entry.rejectedNotes?.length ?? 0) > 0);

  const steps: Array<{
    key: string;
    label: string;
    status: FlowStatus;
    onClick: () => void;
  }> = [
    { key: "paper", label: "문제", status: hasQuestion ? "done" : "needed", onClick: () => onModeChange("paper") },
    { key: "solution", label: "해설", status: hasAnswer ? "done" : "needed", onClick: () => onModeChange("solution") },
    { key: "learning", label: "특강", status: hasLearning ? "done" : "needed", onClick: () => onModeChange("learning") },
    { key: "focus", label: "집중", status: focusAvailable ? "available" : "needed", onClick: onStartFocus },
    { key: "review", label: "복습", status: hasAuditWarning ? "warning" : hasReview ? "done" : "available", onClick: () => onModeChange(hasAuditWarning ? "analysis" : "paper") },
  ];

  return (
    <nav className="study-flow-strip" aria-label="학습 흐름">
      {steps.map((step, index) => (
        <button
          key={step.key}
          type="button"
          className={`study-flow-step study-flow-step--${step.status}`}
          onClick={step.onClick}
        >
          <span>{step.label}</span>
          <small>{statusLabel(step.status)}</small>
          {index < steps.length - 1 && <i aria-hidden="true">→</i>}
        </button>
      ))}
    </nav>
  );
}
