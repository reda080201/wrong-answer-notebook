import type { ExamQuestionSnapshot, ExamResponse } from "../../../types";
import MathText from "../../../components/MathText";
import { isMultipleChoiceQuestion } from "../../../utils/structuredQuestionType";
import { parseChoice } from "../../../utils/choice";

interface ExamResponseEditorProps {
  question: ExamQuestionSnapshot;
  response?: ExamResponse;
  disabled?: boolean;
  compact?: boolean;
  onChange(response: string): void;
}

/** Shared by the paper and answer sheet so answer-type semantics cannot drift. */
export default function ExamResponseEditor({ question, response, disabled = false, compact = false, onChange }: ExamResponseEditorProps) {
  if (isMultipleChoiceQuestion(question.questionType, question.choices)) {
    return <div className={compact ? "real-exam-answer-sheet-choices is-compact" : "real-exam-choices"} role="group" aria-label={`${question.questionNumber}번 선택지`}>
      {question.choices.map((choice) => {
        const parsed = parseChoice(choice);
        const selected = response?.response === parsed.marker || response?.response === parsed.content;
        return <button key={choice} type="button" aria-pressed={selected} disabled={disabled} onClick={() => onChange(parsed.marker || parsed.content)}><b>{parsed.marker}</b>{!compact && <MathText text={parsed.content} />}</button>;
      })}
    </div>;
  }

  const label = `${question.questionNumber}번 답안`;
  return question.questionType === "essay"
    ? <label className="real-exam-answer-field">답안<textarea aria-label={label} value={response?.response ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>
    : <label className="real-exam-answer-field">답안<input aria-label={label} value={response?.response ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}
