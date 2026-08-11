import { useRef } from "react";
import MathText from "../../../components/MathText";
import { detectSuspiciousTextSegments } from "../../../utils/suspiciousText";

interface TextReviewSplitViewProps {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
}

export default function TextReviewSplitView({ id, label, value, onChange }: TextReviewSplitViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suspicious = detectSuspiciousTextSegments(value);

  const focusSegment = (start: number, end: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(start, end);
  };

  return (
    <section className="import-text-review" aria-label={`${label} 검수`}>
      <div className="import-text-review-pane">
        <label htmlFor={id}>{label} 원문</label>
        <textarea
          ref={textareaRef}
          id={id}
          aria-label={label}
          className="import-preview-edit"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <div className="import-text-review-pane import-text-review-preview">
        <h4 id={`${id}-preview`}>{label} 수식 미리보기</h4>
        <div aria-labelledby={`${id}-preview`} className="import-text-review-content">
          <MathText text={value} />
        </div>
        {suspicious.length > 0 && (
          <nav className="import-suspicious-navigator" aria-label="의심 구간 이동">
            <strong>확인 필요</strong>
            {suspicious.map((segment) => (
              <button key={segment.id} type="button" onClick={() => focusSegment(segment.start, segment.end)}>
                {segment.reason}: {segment.text.slice(0, 28)}
              </button>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
