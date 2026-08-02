import type { ChecklistItem, ReviewStrategy, WrongAnswerEntry } from "../types";
import type { ConceptAnalyticsItem } from "../utils/conceptAnalytics";
import { PRACTICE_MODE_LABELS, mistakeCauseLabel, summarizeMistakeAnalysis } from "../utils/mistakeAnalysis";
import CollapsibleSection from "./CollapsibleSection";
import ConceptGraph from "./ConceptGraph";
import MathText from "./MathText";

interface EntryImportAuditSectionProps {
  entry: WrongAnswerEntry;
}

export function EntryImportAuditSection({ entry }: EntryImportAuditSectionProps) {
  if (!entry.importAudit && (entry.rejectedNotes?.length ?? 0) === 0) return null;

  const hasDanger = Boolean(
    entry.importAudit?.missingQuestionNumbers.length ||
    entry.importAudit?.handwritingExcluded === false,
  );

  return (
    <section className={`import-audit-summary detail-import-audit ${hasDanger ? "import-audit-summary--danger" : ""}`}>
      <strong>AI 가져오기 검토</strong>
      {entry.importAudit && (
        <>
          <span>
            예상 {entry.importAudit.expectedQuestionNumbers.length} · 감지 {entry.importAudit.detectedQuestionNumbers.length} · 검토 {entry.importAudit.needsReviewCount}
          </span>
          {entry.importAudit.missingQuestionNumbers.length > 0 && <p>누락 문제: {entry.importAudit.missingQuestionNumbers.join(", ")}</p>}
          {entry.importAudit.uncertainQuestionNumbers.length > 0 && <p>불확실 문제: {entry.importAudit.uncertainQuestionNumbers.join(", ")}</p>}
          {!entry.importAudit.handwritingExcluded && <p>손글씨 제외 여부가 확인되지 않았습니다.</p>}
        </>
      )}
      {(entry.rejectedNotes?.length ?? 0) > 0 && (
        <div className="import-rejected-notes">
          <b>제외된 학생 필기</b>
          <ul>{entry.rejectedNotes?.map((note) => <li key={note}><MathText text={note} /></li>)}</ul>
        </div>
      )}
    </section>
  );
}

interface EntryMistakeAnalysisSectionProps {
  entry: WrongAnswerEntry;
  diagnosisStrategy?: ReviewStrategy;
  hasMistakeAnalysis: boolean;
}

export function EntryMistakeAnalysisSection({
  entry,
  diagnosisStrategy,
  hasMistakeAnalysis,
}: EntryMistakeAnalysisSectionProps) {
  return (
    <CollapsibleSection
      title="오답 원인"
      badge={hasMistakeAnalysis ? summarizeMistakeAnalysis(entry) : "미분류"}
      defaultOpen={hasMistakeAnalysis}
    >
      {hasMistakeAnalysis ? (
        <div className="mistake-analysis-detail">
          <div className="mistake-analysis-cause-list">
            {(entry.mistakeAnalysis?.causes ?? []).map((cause) => (
              <div key={cause.type} className={`mistake-analysis-cause mistake-analysis-cause--${cause.severity}`}>
                <strong>{mistakeCauseLabel(cause.type)}</strong>
                <span>{cause.severity === "high" ? "높음" : cause.severity === "low" ? "낮음" : "보통"}</span>
                {cause.note && <p>{cause.note}</p>}
              </div>
            ))}
          </div>
          {diagnosisStrategy && (
            <p className="mistake-analysis-strategy">추천 복습: {PRACTICE_MODE_LABELS[diagnosisStrategy]}</p>
          )}
          {entry.mistakeAnalysis?.preventionNote && (
            <div className="mistake-analysis-prevention">
              <strong>다음에 피할 방법</strong>
              <p>{entry.mistakeAnalysis.preventionNote}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="concept-graph-empty">
          아직 오답 원인이 없습니다. 수정 화면에서 계산 실수, 조건 해석 실패, 개념 누락 등을 선택해 주세요.
        </p>
      )}
    </CollapsibleSection>
  );
}

interface ConceptChecklistSectionProps {
  checklist: ChecklistItem[];
  newItemText: string;
  onNewItemTextChange: (value: string) => void;
  onChange: (checklist: ChecklistItem[]) => void;
  createId: () => string;
}

export function ConceptChecklistSection({
  checklist,
  newItemText,
  onNewItemTextChange,
  onChange,
  createId,
}: ConceptChecklistSectionProps) {
  const addItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    onChange([...checklist, { id: createId(), text, checked: false }]);
    onNewItemTextChange("");
  };

  return (
    <CollapsibleSection title="개념 체크리스트" defaultOpen>
      <div className="concept-checklist">
        {checklist.map((item) => (
          <label key={item.id} className="concept-checklist-item">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(event) => onChange(checklist.map((current) =>
                current.id === item.id ? { ...current, checked: event.target.checked } : current,
              ))}
            />
            <span>{item.text}</span>
            <button
              type="button"
              className="btn-icon danger"
              onClick={() => onChange(checklist.filter((current) => current.id !== item.id))}
            >
              삭제
            </button>
          </label>
        ))}
        <div className="concept-checklist-add">
          <input
            value={newItemText}
            onChange={(event) => onNewItemTextChange(event.target.value)}
            placeholder="체크리스트 항목"
            onKeyDown={(event) => {
              if (event.key === "Enter") addItem();
            }}
          />
          <button type="button" className="btn-secondary" onClick={addItem}>추가</button>
        </div>
      </div>
    </CollapsibleSection>
  );
}

interface ConceptConnectionsSectionProps {
  entry: WrongAnswerEntry;
  allEntries: WrongAnswerEntry[];
  relatedEntries: WrongAnswerEntry[];
  analytics?: ConceptAnalyticsItem;
  onOpenEntry?: (entryId: string) => void;
}

export function ConceptConnectionsSection({
  entry,
  allEntries,
  relatedEntries,
  analytics,
  onOpenEntry,
}: ConceptConnectionsSectionProps) {
  return (
    <CollapsibleSection title="연결된 개념과 항목" badge={`${relatedEntries.length}개`} defaultOpen={false}>
      <ConceptGraph
        entries={allEntries}
        focusEntry={entry}
        onOpenEntry={(entryId) => {
          onOpenEntry?.(entryId);
        }}
      />
      {analytics && (
        <div className="concept-analytics-strip">
          <div><strong>{analytics.relatedEntries.length}</strong><span>연결 오답</span></div>
          <div><strong>{analytics.dueCount}</strong><span>복습 필요</span></div>
          <div>
            <strong>{analytics.reviewSuccessRate === null ? "-" : `${Math.round(analytics.reviewSuccessRate * 100)}%`}</strong>
            <span>복습 성공률</span>
          </div>
          <div>
            <strong>{analytics.primaryCauses[0] ? mistakeCauseLabel(analytics.primaryCauses[0].type) : "-"}</strong>
            <span>주요 원인</span>
          </div>
        </div>
      )}
      {relatedEntries.length > 0 && (
        <div className="related-entry-list">
          {relatedEntries.map((related) => (
            <button key={related.id} type="button" className="related-entry" onClick={() => onOpenEntry?.(related.id)}>
              <span>{related.title || "(제목 없음)"}</span>
              <small>{related.subject}</small>
            </button>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
