import type { ExamQuestionSnapshot } from "../../../models/exam";
import { isMultipleChoiceQuestion } from "../../../utils/structuredQuestionType";
import MathText from "../../../components/MathText";

export function parseChoice(choice: string) {
  const match = choice.trim().match(/^(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|\(\d{1,2}\)|\d{1,2}\)|[A-Ea-e][.)])\s*(.*)$/);
  return match ? { marker: match[1], content: match[2] } : { marker: "", content: choice };
}

interface ExamResponseEditorProps {
  question: ExamQuestionSnapshot;
  value: string;
  disabled?: boolean;
  compact?: boolean;
  onChange(value: string): void;
}

export default function ExamResponseEditor({ question, value, disabled = false, compact = false, onChange }: ExamResponseEditorProps) {
  if (isMultipleChoiceQuestion(question.questionType, question.choices)) {
    return <div className={`${compact ? "real-exam-answer-sheet-choices" : "exam-choice-list"} exam-response-choices${compact ? " exam-response-choices--compact" : ""}`} role="group" aria-label={`${question.questionNumber}번 답안 선택`}>
      {question.choices.map((choice) => {
        const parsed = parseChoice(choice);
        const answer = parsed.marker || parsed.content;
        return <button key={choice} type="button" className={compact ? undefined : "exam-choice"} aria-pressed={value === parsed.marker || value === parsed.content} disabled={disabled} onClick={() => onChange(answer)}>
          <span className={compact ? undefined : "choice-marker"}>{parsed.marker || "답"}</span>
          {!compact && <span className="choice-content"><MathText text={parsed.content} /></span>}
        </button>;
      })}
    </div>;
  }
  const label = `${question.questionNumber}번 답안`;
  return question.questionType === "essay"
    ? <textarea aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    : <input aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}
