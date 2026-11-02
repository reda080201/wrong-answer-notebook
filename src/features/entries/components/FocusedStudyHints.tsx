import MathText from "../../../components/MathText";

interface FocusedStudyHint {
  label: string;
  text: string;
}

interface FocusedStudyHintsProps {
  nextActionHint: string;
  hints: FocusedStudyHint[];
  onRecordCorrect?: () => void;
  saving?: boolean;
}

export default function FocusedStudyHints({
  nextActionHint,
  hints,
  onRecordCorrect,
  saving,
}: FocusedStudyHintsProps) {
  return (
    <aside className="focus-study-hints" aria-label="집중 보기 학습 힌트">
      <header>
        <span>다음 행동</span>
        <strong>{nextActionHint}</strong>
        {onRecordCorrect && <button type="button" className="btn-primary" disabled={saving} onClick={onRecordCorrect}>{saving ? "기록 중…" : "맞음 기록"}</button>}
      </header>
      {hints.length > 0 ? (
        <div className="focus-study-hint-list">
          {hints.map((hint) => (
            <p key={`${hint.label}-${hint.text}`}>
              <span>{hint.label}</span>
              <MathText text={hint.text} />
            </p>
          ))}
        </div>
      ) : (
        <p className="focus-study-hint-empty">
          짧은 문제는 정답 확인 후 바로 복습 결과를 남겨도 좋습니다.
        </p>
      )}
    </aside>
  );
}
